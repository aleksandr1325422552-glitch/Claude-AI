import assert from 'node:assert/strict'
import test from 'node:test'

import { EventBus } from '../src/core/EventBus.js'
import { Rng } from '../src/core/rng.js'
import { plural } from '../src/core/util.js'

import { Farm, PHASE } from '../src/sim/Farm.js'
import { Creature, CSTATE, STAGE } from '../src/sim/Creature.js'
import { Pasture, TILE } from '../src/sim/Pasture.js'
import { Warehouse } from '../src/sim/Warehouse.js'
import { Market } from '../src/sim/Market.js'
import { Truck } from '../src/sim/Truck.js'
import { Nursery } from '../src/sim/Nursery.js'
import { Factory } from '../src/sim/Factory.js'

import { LEVELS, starsFor } from '../src/data/levels.js'
import { computeStats, upgradeCost } from '../src/data/upgrades.js'
import { hybridOf, isHybrid, offspringOf, species } from '../src/data/species.js'
import { ITEMS } from '../src/data/items.js'
import { FACTORIES } from '../src/data/recipes.js'

const testLevel = {
  id: 'test',
  name: 'Тест',
  story: '',
  time: 120,
  startCreatures: [{ species: 'fairy', stage: 'adult', count: 1 }],
  shopSpecies: ['fairy', 'slime'],
  factories: ['alchemy'],
  buyableFactories: ['jewelry'],
  raiders: null,
  goals: { produce: { pollen: 2 } },
  stars: [0.5, 0.8],
}

function makeFarm(overrides = {}) {
  const level = { ...testLevel, ...overrides }
  return new Farm({ level, stats: computeStats({}), coins: 1000, bus: new EventBus() })
}

/** Прогоняет симуляцию на `seconds` шагами по 1/60. */
function run(farm, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) farm.update(1 / 60)
}

// ===========================================================================

test('склад ограничен по вместимости', () => {
  const w = new Warehouse(3)
  assert.equal(w.add('pollen', 2), 2)
  assert.equal(w.add('slime', 5), 1, 'влезает только одно место')
  assert.equal(w.count, 3)
  assert.ok(w.isFull)
  assert.equal(w.take('pollen', 1), 1)
  assert.equal(w.free, 1)
  assert.equal(w.get('pollen'), 1)
})

test('склад отдаёт наборы сырья только целиком', () => {
  const w = new Warehouse(10)
  w.add('pollen', 1)
  w.add('slime', 1)
  const cost = { pollen: 2, slime: 1 }
  assert.equal(w.hasAll(cost), false)
  assert.equal(w.takeAll(cost), false)
  assert.equal(w.get('pollen'), 1, 'неудачная попытка ничего не забирает')
  w.add('pollen', 1)
  assert.equal(w.takeAll(cost), true)
  assert.equal(w.count, 0)
})

test('цена на рынке падает от перепроизводства и восстанавливается', () => {
  const m = new Market()
  const base = ITEMS.pollen.price
  assert.equal(m.priceOf('pollen'), base)
  m.sell('pollen', 8)
  const dropped = m.priceOf('pollen')
  assert.ok(dropped < base, 'после продаж цена ниже базовой')
  assert.ok(dropped >= Math.round(base * 0.55), 'но не ниже 55% базовой')
  m.update(200)
  assert.equal(m.priceOf('pollen'), base, 'со временем цена возвращается')
})

test('оценка груза не меняет цены', () => {
  const m = new Market()
  const cargo = new Map([['pearl', 3]])
  const quote = m.quote(cargo)
  assert.ok(quote > 0)
  assert.equal(m.priceOf('pearl'), ITEMS.pearl.price, 'quote() не «портит» рынок')
  assert.equal(m.sell('pearl', 3), quote, 'реальная продажа совпадает с оценкой')
})

test('грядка: полив, рост, поедание', () => {
  const p = new Pasture()
  assert.equal(p.plant(0), true)
  assert.equal(p.plant(0), false, 'дважды полить нельзя')
  p.update(10, 0.3)
  assert.equal(p.tile(0).state, TILE.READY)
  assert.equal(p.readyCount, 1)

  const found = p.findFood(p.tile(0).x, p.tile(0).z, 'cr1')
  assert.equal(found, p.tile(0))
  p.claim(found, 'cr1')
  assert.equal(p.findFood(0, 0, 'cr2'), null, 'занятая грядка недоступна другим')

  assert.equal(p.consume(found), true)
  assert.equal(p.tile(0).state, TILE.BARE)
  assert.equal(p.consume(found), false)
})

test('малыш взрослеет за нужное число приёмов пищи', () => {
  const pasture = new Pasture()
  const baby = new Creature('fairy', STAGE.BABY, 0, 0)
  const def = species('fairy')
  let grew = 0
  const ctx = {
    pasture,
    onProduce: () => {},
    onEat: () => {},
    onGrow: () => grew++,
    onStarve: () => {},
    onFaint: () => {},
  }

  for (let meal = 0; meal < def.mealsToGrow; meal++) {
    pasture.plant(0)
    pasture.update(10, 0.5)
    // Ставим малыша прямо на грядку, чтобы не ждать дорогу.
    baby.x = pasture.tile(0).x
    baby.z = pasture.tile(0).z
    baby.state = CSTATE.IDLE
    baby.satiety = 0
    for (let i = 0; i < 60 * 8; i++) {
      baby.update(1 / 60, ctx)
      if (baby.meals > meal || baby.isAdult) break
    }
  }

  assert.equal(grew, 1)
  assert.equal(baby.stage, STAGE.ADULT)
})

test('взрослый роняет товар после еды', () => {
  const pasture = new Pasture()
  const adult = new Creature('slime', STAGE.ADULT, 0, 0)
  const products = []
  const ctx = {
    pasture,
    onProduce: (_c, id) => products.push(id),
    onEat: () => {},
    onGrow: () => {},
    onStarve: () => {},
    onFaint: () => {},
  }
  pasture.plant(0)
  pasture.update(10, 0.5)
  adult.x = pasture.tile(0).x
  adult.z = pasture.tile(0).z

  for (let i = 0; i < 60 * 40 && products.length === 0; i++) adult.update(1 / 60, ctx)
  assert.deepEqual(products, ['slime'])
})

test('без травы существо голодает и падает', () => {
  const pasture = new Pasture()
  const adult = new Creature('fairy', STAGE.ADULT, 0, 0)
  let starved = 0
  let fainted = 0
  const ctx = {
    pasture,
    onProduce: () => {},
    onEat: () => {},
    onGrow: () => {},
    onStarve: () => starved++,
    // Ферма на этом событии убирает существо со сцены — здесь просто выходим.
    onFaint: () => fainted++,
  }
  let seconds = 0
  for (let i = 0; i < 60 * 120 && fainted === 0; i++, seconds += 1 / 60) adult.update(1 / 60, ctx)

  assert.equal(starved, 1, 'предупреждение о голоде приходит один раз')
  assert.equal(fainted, 1)
  assert.equal(adult.state, CSTATE.FAINT)
  assert.ok(seconds > 60, 'у игрока есть около минуты, чтобы спасти существо')
})

test('мастерская превращает сырьё в изделие', () => {
  const factory = new Factory('alchemy')
  const warehouse = new Warehouse(20)
  const made = []
  const ctx = { warehouse, onStart: () => {}, onCraft: (_f, id) => made.push(id) }

  factory.update(1, ctx)
  assert.equal(factory.state, 'idle', 'без сырья работа не начинается')

  for (const [id, n] of Object.entries(FACTORIES.alchemy.input)) warehouse.add(id, n)
  factory.update(1 / 60, ctx)
  assert.equal(factory.state, 'working')
  assert.equal(warehouse.count, 0, 'сырьё сразу списано')

  for (let i = 0; i < 60 * (FACTORIES.alchemy.time + 1); i++) factory.update(1 / 60, ctx)
  assert.deepEqual(made, ['elixir'])
  assert.equal(factory.onGround, 1)
})

test('мастерская останавливается, когда площадка завалена', () => {
  const factory = new Factory('alchemy')
  const warehouse = new Warehouse(60)
  const ctx = { warehouse, onStart: () => {}, onCraft: () => {} }
  for (let i = 0; i < 12; i++) {
    warehouse.add('pollen', 2)
    warehouse.add('slime', 1)
  }
  for (let i = 0; i < 60 * 60; i++) factory.update(1 / 60, ctx)
  assert.equal(factory.onGround, 3)
  assert.equal(factory.state, 'blocked')
  factory.releaseOne()
  assert.equal(factory.state, 'idle')
})

test('фургон продаёт груз в середине рейса', () => {
  const market = new Market()
  const truck = new Truck(4, 10)
  let revenue = 0
  let returned = false
  const ctx = { market, onSold: (r) => (revenue = r), onReturn: () => (returned = true) }

  assert.equal(truck.send(), false, 'пустой фургон не отправляется')
  truck.add('pollen', 2)
  assert.equal(truck.load, 2)
  assert.equal(truck.send(), true)
  assert.equal(truck.add('pollen', 1), 0, 'в пути грузить нельзя')

  for (let i = 0; i < 60 * 4; i++) truck.update(1 / 60, ctx)
  assert.equal(revenue, 0, 'до рынка ещё не доехали')
  for (let i = 0; i < 60 * 3; i++) truck.update(1 / 60, ctx)
  assert.ok(revenue > 0, 'на середине пути товар продан')
  assert.equal(truck.load, 0)
  for (let i = 0; i < 60 * 6; i++) truck.update(1 / 60, ctx)
  assert.ok(returned)
  assert.equal(truck.state, 'idle')
})

test('питомник: одинаковые виды дают яйцо, разные — гибрид', () => {
  const a = new Creature('fairy', STAGE.ADULT)
  const b = new Creature('fairy', STAGE.ADULT)
  const c = new Creature('slime', STAGE.ADULT)

  assert.equal(offspringOf('fairy', 'fairy').id, 'fairy')
  assert.ok(isHybrid(offspringOf('fairy', 'slime').id))

  const nursery = new Nursery(2)
  const first = nursery.start(a, b)
  assert.equal(first.ok, true)
  assert.equal(first.egg.hybrid, false)
  assert.ok(a.breedCooldown > 0, 'родители уходят на отдых')

  assert.equal(nursery.start(a, c).ok, false, 'уставший родитель не подходит')

  c.breedCooldown = 0
  const d = new Creature('slime', STAGE.ADULT)
  const second = nursery.start(c, d)
  assert.equal(second.ok, true)
  assert.equal(nursery.free, 0)
  assert.equal(nursery.start(new Creature('fairy', STAGE.ADULT), new Creature('slime', STAGE.ADULT)).ok, false, 'мест нет')
})

test('гибрид наследует товары обоих родителей и работает быстрее', () => {
  const hybrid = hybridOf('fairy', 'dragonling')
  assert.deepEqual(hybrid.products.sort(), ['pollen', 'scale'])
  assert.ok(hybrid.produceTime < (species('fairy').produceTime + species('dragonling').produceTime) / 2)
  assert.equal(hybridOf('dragonling', 'fairy').id, hybrid.id, 'порядок родителей не важен')

  const creature = new Creature(hybrid.id, STAGE.ADULT)
  assert.equal(creature.peekProduct(), hybrid.products[0])
  creature.productIndex = 1
  assert.equal(creature.peekProduct(), hybrid.products[1])
  creature.productIndex = 2
  assert.equal(creature.peekProduct(), hybrid.products[0], 'товары чередуются по кругу')
})

test('улучшения складываются и имеют предел', () => {
  const base = computeStats({})
  const upgraded = computeStats({ store: 2, truck: 1, net: 3 })
  assert.equal(upgraded.storeCap, base.storeCap + 12)
  assert.equal(upgraded.truckCap, base.truckCap + 2)
  assert.ok(upgraded.truckTime < base.truckTime)
  assert.ok(upgraded.netSpeed > 0)

  const overflow = computeStats({ store: 99 })
  assert.equal(overflow.storeCap, base.storeCap + 6 * 5, 'больше пяти ступеней не даётся')
  assert.equal(upgradeCost('store', 5), null, 'цена у выкупленного улучшения отсутствует')
  assert.ok(upgradeCost('store', 1) > upgradeCost('store', 0))
})

test('ферма: вода тратится на грядки', () => {
  const farm = makeFarm()
  farm.can.water = 0
  assert.equal(farm.waterTile(0), false, 'без воды полить нельзя')

  farm.drawWater()
  assert.equal(farm.can.water, farm.can.max)
  const before = farm.can.water
  assert.equal(farm.waterTile(0), true)
  assert.equal(farm.can.water, before - 1)
  assert.equal(farm.waterTile(0), false, 'политую грядку не поливают снова')
})

test('ферма: собранный товар попадает на склад и учитывается в целях', () => {
  const farm = makeFarm()
  const drop = farm.drops[0] ?? null
  assert.equal(drop, null, 'на старте товара на земле нет')

  // Ставим взрослую фею на готовую грядку и ждём товар.
  farm.can.water = 9
  for (let i = 0; i < 6; i++) farm.waterTile(i)
  run(farm, 60)

  assert.ok((farm.produced.pollen ?? 0) + farm.drops.length > 0, 'фея что-то произвела')

  const first = farm.drops[0]
  if (first) {
    assert.equal(farm.collectDrop(first.id), true)
    assert.ok(farm.warehouse.get(first.itemId) >= 1)
  }
})

test('ферма: полный склад не принимает товар', () => {
  const farm = makeFarm()
  farm.warehouse.capacity = 1
  farm.warehouse.add('pollen', 1)
  const drop = { id: 'fake', itemId: 'slime', x: 0, z: 0, y: 0.2, vy: 0, spin: 0, spinRate: 1, life: 50, maxLife: 50, from: null }
  farm.drops.push(drop)
  assert.equal(farm.collectDrop('fake'), false)
  assert.equal(farm.drops.length, 1, 'товар остался лежать')
})

test('ферма: покупки списывают монеты, а нехватка денег ничего не ломает', () => {
  const farm = makeFarm()
  const start = farm.coins
  assert.equal(farm.buyAdult('slime'), true)
  assert.equal(farm.coins, start - species('slime').adultPrice)

  farm.coins = 0
  assert.equal(farm.buyAdult('gryphon'), false)
  assert.equal(farm.coins, 0)
  assert.equal(farm.buyFactory('jewelry'), false)
  assert.equal(farm.factories.has('jewelry'), false)
})

test('ферма: цели закрываются и уровень выигрывается', () => {
  const farm = makeFarm({ goals: { produce: { pollen: 1 } } })
  assert.equal(farm.phase, PHASE.PLAY)
  farm.produced.pollen = 1
  farm.update(1 / 60)
  assert.equal(farm.phase, PHASE.WON)

  const state = farm.goalState()
  assert.equal(state.length, 1)
  assert.equal(state[0].done, true)
})

test('ферма: время выходит — уровень проигран', () => {
  const farm = makeFarm({ time: 1, goals: { produce: { artifact: 5 } } })
  run(farm, 2)
  assert.equal(farm.phase, PHASE.LOST)
})

test('ферма: клетка и продажа тварей в цирк', () => {
  const farm = makeFarm({ raiders: { first: 1, interval: 100, hp: 2, price: 90 } })
  run(farm, 1.5)
  assert.equal(farm.raiders.length, 1)

  const raider = farm.raiders[0]
  assert.equal(farm.hitRaider(raider.id), true)
  assert.equal(raider.hp, 1)
  farm.hitRaider(raider.id)
  run(farm, 1.5)
  assert.equal(farm.cage.count, 1)
  assert.equal(farm.trapped, 1)

  const before = farm.coins
  assert.equal(farm.sellCage(), true)
  assert.equal(farm.coins, before + 90)
  assert.equal(farm.cage.count, 0)
  assert.equal(farm.sellCage(), false, 'пустую клетку не продать')
})

test('все уровни описаны корректно', () => {
  assert.ok(LEVELS.length >= 8)
  const ids = new Set()
  for (const level of LEVELS) {
    assert.equal(ids.has(level.id), false, `дубликат уровня ${level.id}`)
    ids.add(level.id)
    assert.ok(level.time > 0)
    assert.ok(level.goals && Object.keys(level.goals).length > 0, `${level.id}: нет целей`)
    assert.equal(level.stars.length, 2)
    assert.ok(level.stars[0] < level.stars[1])

    for (const id of level.factories ?? []) assert.ok(FACTORIES[id], `${level.id}: неизвестная мастерская ${id}`)
    for (const id of level.shopSpecies ?? []) assert.ok(species(id), `${level.id}: неизвестный вид ${id}`)
    for (const entry of level.startCreatures ?? []) assert.ok(species(entry.species))
    for (const id of Object.keys(level.startItems ?? {})) assert.ok(ITEMS[id], `${level.id}: неизвестный товар ${id}`)
    for (const id of Object.keys(level.goals.produce ?? {})) assert.ok(ITEMS[id])

    // Цель по изделию достижима только если нужная мастерская доступна.
    for (const id of Object.keys(level.goals.produce ?? {})) {
      if (ITEMS[id].tier === 0) continue
      const maker = Object.values(FACTORIES).find((f) => f.output === id)
      const available = [...(level.factories ?? []), ...(level.buyableFactories ?? [])]
      assert.ok(available.includes(maker.id), `${level.id}: нет мастерской для ${id}`)
    }
  }
})

test('звёзды зависят от затраченного времени', () => {
  const level = LEVELS[0]
  assert.equal(starsFor(level, 0.1), 3)
  assert.equal(starsFor(level, level.stars[0] + 0.01), 2)
  assert.equal(starsFor(level, 0.99), 1)
})

test('генератор случайных чисел воспроизводим', () => {
  const a = new Rng(42)
  const b = new Rng(42)
  const first = Array.from({ length: 5 }, () => a.next())
  const second = Array.from({ length: 5 }, () => b.next())
  assert.deepEqual(first, second)
  assert.ok(first.every((v) => v >= 0 && v < 1))
})

test('русское склонение по числу', () => {
  assert.equal(plural(1, 'фея', 'феи', 'фей'), 'фея')
  assert.equal(plural(2, 'фея', 'феи', 'фей'), 'феи')
  assert.equal(plural(5, 'фея', 'феи', 'фей'), 'фей')
  assert.equal(plural(11, 'фея', 'феи', 'фей'), 'фей')
  assert.equal(plural(21, 'фея', 'феи', 'фей'), 'фея')
})
