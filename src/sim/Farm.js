import { Creature, CSTATE, STAGE } from './Creature.js'
import { Factory } from './Factory.js'
import { Market } from './Market.js'
import { Nursery } from './Nursery.js'
import { Pasture } from './Pasture.js'
import { Raider } from './Raider.js'
import { Truck } from './Truck.js'
import { Warehouse } from './Warehouse.js'

import { BOUNDS, FACTORY_SPOTS, SPOTS, factoryDropSpot } from '../data/layout.js'
import { ITEMS, item } from '../data/items.js'
import { FACTORIES } from '../data/recipes.js'
import { SPECIES, isHybrid, species as speciesDef } from '../data/species.js'
import { clamp, nextId, removeFrom } from '../core/util.js'

export const PHASE = { PLAY: 'play', WON: 'won', LOST: 'lost' }

const DROP_LIFE = 58
const GRAVITY = -13

/**
 * Вся игровая логика одного уровня. Ничего не знает о three.js и о DOM:
 * наружу отдаёт только состояние (для отрисовки) и события (для эффектов).
 */
export class Farm {
  constructor({ level, stats, coins = 0, bus }) {
    this.bus = bus
    this.level = level
    this.stats = stats
    this.phase = PHASE.PLAY

    this.coins = coins
    this.earned = 0
    this.spent = 0
    this.produced = Object.create(null)
    this.trapped = 0
    this.stolen = 0
    this.fainted = 0

    this.timeLeft = level.time
    this.elapsed = 0

    this.pasture = new Pasture()
    this.warehouse = new Warehouse(stats.storeCap)
    this.market = new Market()
    this.truck = new Truck(stats.truckCap, stats.truckTime)
    this.nursery = new Nursery(2)

    this.well = { water: stats.wellMax, max: stats.wellMax }
    this.can = { water: 0, max: stats.canMax }
    this.cage = { count: 0, capacity: stats.cageCap }

    this.creatures = []
    this.drops = []
    this.raiders = []

    this.factories = new Map()
    for (const id of level.factories ?? []) this.factories.set(id, new Factory(id))

    this.raiderCfg = level.raiders
    this.raiderTimer = this.raiderCfg ? this.raiderCfg.first : Infinity
    this.netAccum = 0

    this.goalsDone = new Set()

    this.#populate()
  }

  #populate() {
    for (const entry of this.level.startCreatures ?? []) {
      for (let i = 0; i < entry.count; i++) {
        const c = new Creature(entry.species, entry.stage === 'adult' ? STAGE.ADULT : STAGE.BABY, ...this.#randomSpot())
        this.creatures.push(c)
      }
    }
    for (const [id, n] of Object.entries(this.level.startItems ?? {})) this.warehouse.add(id, n)
    // Немного травы на старте, чтобы не начинать с голодовки.
    for (const i of [8, 10, 12, 17, 19]) {
      this.pasture.plant(i)
      const t = this.pasture.tile(i)
      t.growth = 0.55
    }
  }

  #randomSpot() {
    return [
      BOUNDS.minX + Math.random() * (BOUNDS.maxX - BOUNDS.minX),
      BOUNDS.minZ + Math.random() * (BOUNDS.maxZ - BOUNDS.minZ),
    ]
  }

  // =========================================================================
  //                                  Такт
  // =========================================================================

  update(dt) {
    if (this.phase !== PHASE.PLAY) return

    this.elapsed += dt
    this.timeLeft = Math.max(0, this.timeLeft - dt)

    this.well.water = Math.min(this.well.max, this.well.water + this.stats.wellRefill * dt)
    this.pasture.update(dt, this.stats.grassRate)
    this.market.update(dt)

    this.#updateCreatures(dt)
    this.#updateDrops(dt)
    this.#updateFactories(dt)
    this.#updateNursery(dt)
    this.#updateRaiders(dt)
    this.#updateTruck(dt)
    this.#updateNet(dt)

    this.#checkGoals()
    if (this.phase === PHASE.PLAY && this.timeLeft <= 0) this.#finish(PHASE.LOST, 'Время вышло')
  }

  #updateCreatures(dt) {
    const ctx = {
      pasture: this.pasture,
      onProduce: (c, itemId) => this.#spawnDrop(itemId, c.x, c.z, { from: 'creature' }),
      onEat: (c) => this.bus.emit('fx', { type: 'eat', x: c.x, z: c.z }),
      onGrow: (c) => {
        this.bus.emit('sfx', 'hatch')
        this.bus.emit('fx', { type: 'grow', x: c.x, z: c.z })
        this.bus.emit('toast', { text: `${c.def.name} выросла!`, kind: 'good' })
      },
      onStarve: (c) => {
        this.bus.emit('toast', { text: `${c.def.name} упала от голода!`, kind: 'bad' })
        this.bus.emit('sfx', 'error')
      },
      onFaint: (c) => {
        removeFrom(this.creatures, c)
        this.fainted++
        this.bus.emit('fx', { type: 'poof', x: c.x, z: c.z })
      },
    }
    for (const c of [...this.creatures]) c.update(dt, ctx)
  }

  #updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      // Простая баллистика с одним отскоком — товар «выпрыгивает» из существа.
      if (d.y > 0.22 || d.vy > 0) {
        d.vy += GRAVITY * dt
        d.y += d.vy * dt
        if (d.y <= 0.22) {
          d.y = 0.22
          d.vy = d.vy < -1.6 ? -d.vy * 0.32 : 0
        }
      }
      d.spin += dt * d.spinRate
      d.life -= dt
      if (d.life <= 0) {
        this.drops.splice(i, 1)
        this.#onDropGone(d, 'expired')
        this.bus.emit('fx', { type: 'poof', x: d.x, z: d.z })
      }
    }
  }

  #updateFactories(dt) {
    const ctx = {
      warehouse: this.warehouse,
      onStart: (f) => {
        const spot = FACTORY_SPOTS[f.id]
        this.bus.emit('fx', { type: 'factory', x: spot.x, z: spot.z, id: f.id })
      },
      onCraft: (f, itemId) => {
        const spot = factoryDropSpot(f.id)
        const jitter = (Math.random() - 0.5) * 1.4
        this.#spawnDrop(itemId, spot.x + jitter, spot.z + (Math.random() - 0.5) * 0.8, { from: f.id })
        this.bus.emit('sfx', 'craft')
      },
    }
    for (const f of this.factories.values()) f.update(dt, ctx)
  }

  #updateNursery(dt) {
    this.nursery.update(dt, {
      onHatch: (egg) => {
        const [x, z] = [SPOTS.nursery.x + 2.4, SPOTS.nursery.z + 0.6]
        const baby = new Creature(egg.offspringId, STAGE.BABY, clamp(x, BOUNDS.minX, BOUNDS.maxX), clamp(z, BOUNDS.minZ, BOUNDS.maxZ))
        this.creatures.push(baby)
        this.bus.emit('sfx', 'hatch')
        this.bus.emit('fx', { type: 'hatch', x: SPOTS.nursery.x, z: SPOTS.nursery.z })
        this.bus.emit('toast', {
          text: egg.hybrid ? `Вылупился гибрид: ${baby.def.name}!` : `Вылупился малыш: ${baby.def.name}`,
          kind: 'good',
        })
      },
    })
  }

  #updateRaiders(dt) {
    if (this.raiderCfg && this.raiderTimer !== Infinity) {
      this.raiderTimer -= dt
      if (this.raiderTimer <= 0) {
        this.raiderTimer = this.raiderCfg.interval
        this.raiders.push(new Raider(this.raiderCfg.hp))
        this.bus.emit('sfx', 'raider')
        this.bus.emit('toast', { text: 'Тёмная тварь на ферме!', kind: 'bad' })
      }
    }

    const ctx = {
      pasture: this.pasture,
      drops: this.drops,
      nearestDrop: (x, z) => this.#nearestDrop(x, z),
      dropExists: (d) => this.drops.includes(d),
      onTrample: (r, tile) => tile && this.bus.emit('fx', { type: 'trample', x: tile.x, z: tile.z }),
      onSteal: (r, drop) => {
        removeFrom(this.drops, drop)
        this.#onDropGone(drop, 'stolen')
        this.stolen++
        this.bus.emit('toast', { text: `Тварь украла: ${item(drop.itemId).name}!`, kind: 'bad' })
        this.bus.emit('sfx', 'error')
      },
      onEscape: (r) => removeFrom(this.raiders, r),
      onCaged: (r) => {
        removeFrom(this.raiders, r)
        this.cage.count = Math.min(this.cage.capacity, this.cage.count + 1)
        this.trapped++
        this.bus.emit('fx', { type: 'cage', x: SPOTS.cage.x, z: SPOTS.cage.z })
      },
    }
    for (const r of [...this.raiders]) r.update(dt, ctx)
  }

  #updateTruck(dt) {
    this.truck.update(dt, {
      market: this.market,
      onSold: (revenue, cargo) => {
        this.bus.emit('sfx', 'sell')
        const list = [...cargo.entries()].map(([id, n]) => `${n}×${item(id).name}`).join(', ')
        this.bus.emit('toast', { text: `Продано: ${list} — ${revenue} монет`, kind: 'good' })
      },
      onReturn: (revenue) => {
        if (revenue > 0) this.addCoins(revenue, SPOTS.truck.x, SPOTS.truck.z)
      },
    })
  }

  /** Волшебный сачок подбирает товар сам — по одному предмету за раз. */
  #updateNet(dt) {
    if (!this.stats.netSpeed) return
    this.netAccum += this.stats.netSpeed * dt
    while (this.netAccum >= 1) {
      this.netAccum -= 1
      if (this.warehouse.isFull) break
      // Подбираем то, что скоро исчезнет.
      let oldest = null
      for (const d of this.drops) if (!oldest || d.life < oldest.life) oldest = d
      if (!oldest) {
        this.netAccum = 0
        break
      }
      this.collectDrop(oldest.id, true)
    }
  }

  // =========================================================================
  //                            Товары на земле
  // =========================================================================

  #spawnDrop(itemId, x, z, { from = null } = {}) {
    const drop = {
      id: nextId('dp'),
      itemId,
      x: clamp(x + (Math.random() - 0.5) * 0.5, BOUNDS.minX - 2, BOUNDS.maxX + 2),
      z: clamp(z + (Math.random() - 0.5) * 0.5, BOUNDS.minZ - 3, BOUNDS.maxZ + 2),
      y: 0.75,
      vy: 2.6,
      spin: Math.random() * Math.PI * 2,
      spinRate: 0.8 + Math.random() * 0.9,
      life: DROP_LIFE,
      maxLife: DROP_LIFE,
      from,
    }
    this.drops.push(drop)
    this.bus.emit('fx', { type: 'drop', x, z })
    return drop
  }

  #onDropGone(drop, reason) {
    // Мастерская держит счёт лежащих изделий, чтобы не завалить площадку.
    if (drop.from && this.factories.has(drop.from)) this.factories.get(drop.from).releaseOne()
    if (reason === 'expired') this.bus.emit('toast', { text: `${item(drop.itemId).name} пропал(а)`, kind: 'bad' })
  }

  #nearestDrop(x, z) {
    let best = null
    let bestDist = Infinity
    for (const d of this.drops) {
      const dist = (d.x - x) ** 2 + (d.z - z) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = d
      }
    }
    return best
  }

  // =========================================================================
  //                          Действия игрока
  // =========================================================================

  /** Набрать воду из колодца в лейку. */
  drawWater() {
    if (this.can.water >= this.can.max) {
      this.bus.emit('toast', { text: 'Лейка уже полная', kind: '' })
      return false
    }
    const need = this.can.max - this.can.water
    const got = Math.min(need, Math.floor(this.well.water))
    if (got <= 0) {
      this.bus.emit('toast', { text: 'Колодец пуст — подождите', kind: 'bad' })
      this.bus.emit('sfx', 'error')
      return false
    }
    this.well.water -= got
    this.can.water += got
    this.bus.emit('sfx', 'pump')
    this.bus.emit('fx', { type: 'water', x: SPOTS.well.x, z: SPOTS.well.z })
    return true
  }

  /** Посеять и полить грядку. */
  waterTile(index) {
    const tile = this.pasture.tile(index)
    if (!tile) return false
    if (tile.state !== 'bare') {
      this.bus.emit('toast', { text: 'Здесь уже растёт трава', kind: '' })
      return false
    }
    if (this.can.water < 1) {
      this.bus.emit('toast', { text: 'В лейке нет воды — кликните колодец', kind: 'bad' })
      this.bus.emit('sfx', 'error')
      return false
    }
    this.can.water -= 1
    this.pasture.plant(index)
    this.bus.emit('sfx', 'plant')
    this.bus.emit('fx', { type: 'plant', x: tile.x, z: tile.z })
    return true
  }

  /** Подобрать товар с земли. */
  collectDrop(dropId, silent = false) {
    const drop = this.drops.find((d) => d.id === dropId)
    if (!drop) return false
    if (this.warehouse.isFull) {
      if (!silent) {
        this.bus.emit('toast', { text: 'Склад переполнен! Отвезите товар на рынок', kind: 'bad' })
        this.bus.emit('sfx', 'error')
      }
      return false
    }
    this.warehouse.add(drop.itemId, 1)
    this.produced[drop.itemId] = (this.produced[drop.itemId] ?? 0) + 1
    removeFrom(this.drops, drop)
    this.#onDropGone(drop, 'collected')
    this.bus.emit('sfx', 'pick')
    this.bus.emit('fx', { type: 'collect', x: drop.x, z: drop.z, itemId: drop.itemId })
    return true
  }

  /** Клик по твари. */
  hitRaider(raiderId) {
    const r = this.raiders.find((x) => x.id === raiderId)
    if (!r) return false
    const result = r.hit(this.cage.count < this.cage.capacity)
    if (result === 'hit') {
      this.bus.emit('sfx', 'hit')
      this.bus.emit('fx', { type: 'hit', x: r.x, z: r.z })
    } else if (result === 'caught') {
      this.bus.emit('sfx', 'trap')
      this.bus.emit('fx', { type: 'hit', x: r.x, z: r.z })
    } else if (result === 'blocked') {
      this.bus.emit('toast', { text: 'Клетка полна! Продайте тварей в цирк', kind: 'bad' })
      this.bus.emit('sfx', 'error')
    }
    return result !== 'miss'
  }

  /** Продать пойманных тварей в цирк. */
  sellCage() {
    if (this.cage.count <= 0) {
      this.bus.emit('toast', { text: 'В клетке никого нет', kind: '' })
      return false
    }
    const price = this.raiderCfg?.price ?? 100
    const total = price * this.cage.count
    this.cage.count = 0
    this.addCoins(total, SPOTS.cage.x, SPOTS.cage.z)
    this.bus.emit('sfx', 'sell')
    this.bus.emit('toast', { text: `Цирк заплатил ${total} монет`, kind: 'good' })
    return true
  }

  /** Погладить существо — только настроение и подсказка. */
  pet(creatureId) {
    const c = this.creatures.find((x) => x.id === creatureId)
    if (!c) return null
    if (c.state !== CSTATE.FAINT) {
      c.wanderPause = 0.5
      this.bus.emit('fx', { type: 'pet', x: c.x, z: c.z })
      this.bus.emit('sfx', 'ui')
    }
    return c
  }

  loadTruck(itemId, n = 1) {
    if (!this.truck.isIdle) {
      this.bus.emit('toast', { text: 'Фургон в пути', kind: '' })
      return 0
    }
    if (this.truck.free <= 0) {
      this.bus.emit('toast', { text: 'Фургон полон — отправляйте!', kind: '' })
      this.bus.emit('sfx', 'error')
      return 0
    }
    const want = Math.min(n, this.truck.free, this.warehouse.get(itemId))
    if (want <= 0) return 0
    this.warehouse.take(itemId, want)
    this.truck.add(itemId, want)
    this.bus.emit('sfx', 'ui')
    return want
  }

  unloadTruck(itemId, n = 1) {
    if (!this.truck.isIdle) return 0
    const want = Math.min(n, this.truck.cargo.get(itemId) ?? 0, this.warehouse.free)
    if (want <= 0) return 0
    this.truck.remove(itemId, want)
    this.warehouse.add(itemId, want)
    this.bus.emit('sfx', 'ui')
    return want
  }

  sendTruck() {
    if (!this.truck.isIdle) return false
    if (this.truck.load === 0) {
      this.bus.emit('toast', { text: 'Фургон пустой — загрузите товар со склада', kind: '' })
      this.bus.emit('sfx', 'error')
      return false
    }
    this.truck.send()
    this.bus.emit('sfx', 'truck')
    return true
  }

  // ---- рынок: покупки ------------------------------------------------------

  get shopSpecies() {
    return (this.level.shopSpecies ?? []).map((id) => SPECIES[id]).filter(Boolean)
  }

  get buyableFactories() {
    return (this.level.buyableFactories ?? []).filter((id) => !this.factories.has(id)).map((id) => FACTORIES[id])
  }

  buyEgg(speciesId) {
    const def = speciesDef(speciesId)
    if (this.nursery.free <= 0) {
      this.bus.emit('toast', { text: 'В инкубаторе нет места', kind: 'bad' })
      return false
    }
    if (!this.pay(def.eggPrice)) return false
    this.nursery.addPurchased(def, this.stats.hatchMul)
    this.bus.emit('sfx', 'egg')
    this.bus.emit('toast', { text: `Яйцо (${def.name}) в инкубаторе`, kind: 'good' })
    return true
  }

  buyAdult(speciesId) {
    const def = speciesDef(speciesId)
    if (!this.pay(def.adultPrice)) return false
    const c = new Creature(speciesId, STAGE.ADULT, ...this.#randomSpot())
    this.creatures.push(c)
    this.bus.emit('sfx', 'hatch')
    this.bus.emit('toast', { text: `${def.name} присоединилась к ферме`, kind: 'good' })
    return true
  }

  buyFactory(id) {
    const def = FACTORIES[id]
    if (!def || this.factories.has(id)) return false
    if (!this.pay(def.price)) return false
    this.factories.set(id, new Factory(id))
    this.bus.emit('sfx', 'upgrade')
    this.bus.emit('toast', { text: `Построена мастерская: ${def.name}`, kind: 'good' })
    return true
  }

  sellCreature(creatureId) {
    const c = this.creatures.find((x) => x.id === creatureId)
    if (!c) return false
    if (this.creatures.length <= 1) {
      this.bus.emit('toast', { text: 'Нельзя продать последнего работника', kind: 'bad' })
      return false
    }
    const price = Math.round((c.isAdult ? c.def.adultPrice : c.def.eggPrice) * 0.5)
    removeFrom(this.creatures, c)
    this.pasture.release(c.targetTile, c.id)
    this.addCoins(price, c.x, c.z)
    this.bus.emit('fx', { type: 'poof', x: c.x, z: c.z })
    this.bus.emit('toast', { text: `${c.def.name} продана за ${price}`, kind: 'good' })
    return true
  }

  breed(idA, idB) {
    const a = this.creatures.find((c) => c.id === idA)
    const b = this.creatures.find((c) => c.id === idB)
    const result = this.nursery.start(a, b, this.stats.hatchMul)
    if (!result.ok) {
      this.bus.emit('toast', { text: result.reason, kind: 'bad' })
      this.bus.emit('sfx', 'error')
      return result
    }
    this.bus.emit('sfx', 'egg')
    this.bus.emit('fx', { type: 'hatch', x: SPOTS.nursery.x, z: SPOTS.nursery.z })
    this.bus.emit('toast', {
      text: result.egg.hybrid ? `Гибридное яйцо: ${result.offspring.name}` : `Яйцо (${result.offspring.name}) в инкубаторе`,
      kind: 'good',
    })
    return result
  }

  // ---- деньги --------------------------------------------------------------

  addCoins(amount, x = 0, z = 0) {
    this.coins += amount
    this.earned += amount
    this.bus.emit('sfx', 'coin')
    this.bus.emit('coins', { coins: this.coins, delta: amount, x, z })
  }

  pay(amount) {
    if (this.coins < amount) {
      this.bus.emit('toast', { text: 'Не хватает монет', kind: 'bad' })
      this.bus.emit('sfx', 'error')
      return false
    }
    this.coins -= amount
    this.spent += amount
    this.bus.emit('coins', { coins: this.coins, delta: -amount })
    return true
  }

  // =========================================================================
  //                                  Цели
  // =========================================================================

  countAdults(speciesId) {
    return this.creatures.filter((c) => c.isAdult && c.speciesId === speciesId).length
  }

  countHybrids() {
    return this.creatures.filter((c) => isHybrid(c.speciesId)).length
  }

  /** Список целей уровня с текущим прогрессом — для верхней панели и итогов. */
  goalState() {
    const g = this.level.goals ?? {}
    const out = []

    if (g.coins != null) out.push({ key: 'coins', icon: '🪙', title: 'Монеты', have: Math.floor(this.coins), need: g.coins })
    if (g.earned != null) out.push({ key: 'earned', icon: '💰', title: 'Заработать', have: Math.floor(this.earned), need: g.earned })
    for (const [id, need] of Object.entries(g.produce ?? {})) {
      out.push({ key: `produce:${id}`, icon: ITEMS[id].emoji, title: ITEMS[id].name, have: this.produced[id] ?? 0, need })
    }
    for (const [id, need] of Object.entries(g.creatures ?? {})) {
      out.push({ key: `creatures:${id}`, icon: SPECIES[id].emoji, title: SPECIES[id].name, have: this.countAdults(id), need })
    }
    if (g.hybrids != null) out.push({ key: 'hybrids', icon: '🧬', title: 'Гибриды', have: this.countHybrids(), need: g.hybrids })
    if (g.trap != null) out.push({ key: 'trap', icon: '🪤', title: 'Поймать тварей', have: this.trapped, need: g.trap })

    for (const goal of out) goal.done = goal.have >= goal.need
    return out
  }

  #checkGoals() {
    const goals = this.goalState()
    for (const goal of goals) {
      if (goal.done && !this.goalsDone.has(goal.key)) {
        this.goalsDone.add(goal.key)
        this.bus.emit('toast', { text: `Цель выполнена: ${goal.title}`, kind: 'good' })
      }
    }
    if (goals.length && goals.every((g) => g.done)) this.#finish(PHASE.WON)
  }

  #finish(phase, reason = '') {
    if (this.phase !== PHASE.PLAY) return
    this.phase = phase
    this.bus.emit('sfx', phase === PHASE.WON ? 'win' : 'lose')
    this.bus.emit('phase', { phase, reason })
  }

  /** Досрочная сдача уровня. */
  giveUp() {
    this.#finish(PHASE.LOST, 'Уровень сдан')
  }

  /** Доля израсходованного времени — по ней считаются звёзды. */
  get usedFraction() {
    return clamp(this.elapsed / this.level.time, 0, 1)
  }
}
