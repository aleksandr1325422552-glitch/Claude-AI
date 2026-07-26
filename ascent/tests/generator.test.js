import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTower, jumpApex, jumpReach, isReachable } from '../src/world/generator.js'
import { createCollisionWorld } from '../src/world/collision.js'
import { createPalette } from '../src/render/palette.js'
import { PHYSICS, TOWER } from '../src/game/config.js'

/**
 * Генератор обязан строить башню, на которую физически можно забраться.
 * Недостижимая платформа обрывает забег без вины игрока — это худший баг,
 * который может быть в игре про подъём, и заметить его на глаз почти нельзя.
 */

test('апекс одиночного прыжка выше максимального шага платформ', () => {
  // Иначе базовый путь наверх требовал бы двойного прыжка, который стоит
  // стамины, — подъём упирался бы в её восстановление и глох.
  assert.ok(
    jumpApex() > TOWER.stepMax,
    `апекс ${jumpApex().toFixed(2)} м должен превышать шаг ${TOWER.stepMax} м`,
  )
})

test('дальность прыжка падает с ростом высоты подъёма', () => {
  const low = jumpReach(1)
  const high = jumpReach(3.4)
  assert.ok(low > high, 'чем выше цель, тем меньше остаётся на горизонталь')
  assert.equal(jumpReach(jumpApex() + 0.1), 0, 'выше апекса допрыгнуть нельзя')
})

test('расчёт дальности согласуется с числами физики', () => {
  // Проверяем формулу независимым способом: пошаговым интегрированием той же
  // модели, по которой живёт игрок. Расхождение означало бы, что генератор и
  // физика разошлись между собой.
  const dt = 1 / 1000
  let y = 0
  let vy = PHYSICS.jumpSpeed
  let t = 0
  let peak = 0
  while (t < 5) {
    const g = vy < 0 ? PHYSICS.gravity * PHYSICS.fallGravityScale : PHYSICS.gravity
    vy += g * dt
    y += vy * dt
    t += dt
    if (y > peak) peak = y
    if (y <= 0 && vy < 0) break
  }
  assert.ok(Math.abs(peak - jumpApex()) < 0.05, `апекс: формула ${jumpApex().toFixed(3)}, интеграл ${peak.toFixed(3)}`)

  const reach = PHYSICS.runSpeed * t
  assert.ok(
    Math.abs(reach - jumpReach(0)) < 0.15,
    `дальность: формула ${jumpReach(0).toFixed(3)}, интеграл ${reach.toFixed(3)}`,
  )
})

test('isReachable учитывает радиусы платформ', () => {
  const from = { x: 0, y: 0, z: 0, radius: 3 }
  // Далеко по горизонтали, но обе платформы широкие — край до края достаётся.
  assert.equal(isReachable(from, { x: 9, y: 2, z: 0, radius: 3 }), true)
  // Те же координаты, но платформы узкие — уже нет.
  assert.equal(isReachable({ ...from, radius: 0.2 }, { x: 9, y: 2, z: 0, radius: 0.2 }), false)
  // Вниз можно прыгать всегда.
  assert.equal(isReachable(from, { x: 30, y: -10, z: 0, radius: 1 }), true)
})

/**
 * Проходит башню снизу вверх, как это делает игрок.
 *
 * Помимо уцелевшего среза возвращает `seen` — все платформы, что вообще были
 * построены. Проверять проходимость по срезу нельзя: сегменты за спиной
 * выгружаются, и в срезе соседями оказываются платформы, разделённые сотнями
 * метров, которых игрок никогда не видел рядом.
 */
function climb(seed, height) {
  const scene = new THREE.Scene()
  const collision = createCollisionWorld()
  const tower = createTower(scene, collision, { seed })
  const palette = createPalette()

  const seen = new Map()
  const remember = () => {
    for (const p of tower.platforms) {
      // Берём координаты постройки, а не текущие: лифты и вращающиеся площадки
      // уезжают со своего места, и генератор строил цепочку именно по базовым.
      const x = p.baseX
      const y = p.baseY
      const z = p.baseZ
      const key = `${y.toFixed(4)}:${x.toFixed(4)}:${z.toFixed(4)}`
      if (!seen.has(key)) seen.set(key, { kind: p.kind, x, y, z, radius: p.radius })
    }
  }

  tower.prime(palette.state)
  remember()
  for (let y = 0; y <= height; y += TOWER.chunkHeight / 2) {
    palette.update(y)
    tower.tick(1 / 60)
    tower.update(y, 1 / 60)
    remember()
  }

  return { tower, collision, scene, seen: [...seen.values()].sort((a, b) => a.y - b.y) }
}

test('каждая платформа достижима с предыдущей на 2000 м подъёма', () => {
  for (const seed of ['сид-1', 'сид-2', 'сид-3']) {
    const { seen } = climb(seed, 2000)
    assert.ok(seen.length > 100, `сид ${seed}: башня должна содержать платформы, найдено ${seen.length}`)

    for (let i = 1; i < seen.length; i++) {
      const from = seen[i - 1]
      const to = seen[i]
      assert.ok(
        isReachable(from, to),
        `сид ${seed}: платформа на ${to.y.toFixed(1)} м недостижима с ${from.y.toFixed(1)} м ` +
          `(по горизонтали ${Math.hypot(to.x - from.x, to.z - from.z).toFixed(1)} м, ` +
          `подъём ${(to.y - from.y).toFixed(1)} м)`,
      )
    }
  }
})

test('шаг между платформами не превышает заданный в настройках', () => {
  const { seen } = climb('шаг', 1200)
  for (let i = 1; i < seen.length; i++) {
    const step = seen[i].y - seen[i - 1].y
    assert.ok(step <= TOWER.stepMax + 0.01, `шаг ${step.toFixed(2)} м превышает ${TOWER.stepMax} м`)
  }
})

test('один сид даёт одну и ту же башню', () => {
  const a = climb('повтор', 600)
  const b = climb('повтор', 600)

  const key = (list) =>
    [...list]
      .sort((p, q) => p.y - q.y)
      .map((p) => `${p.kind}:${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.z.toFixed(3)}`)
      .join('|')

  assert.equal(key(a.tower.platforms), key(b.tower.platforms), 'башни с одним сидом должны совпадать')
})

test('разные сиды дают разные башни', () => {
  const a = climb('первый', 600)
  const b = climb('второй', 600)
  const key = (list) => [...list].sort((p, q) => p.y - q.y).map((p) => p.y.toFixed(2)).join('|')
  assert.notEqual(key(a.tower.platforms), key(b.tower.platforms))
})

test('за снятыми сегментами не остаётся коллайдеров', () => {
  const { tower, collision } = climb('уборка', 1500)

  // Всё, что осталось в мире столкновений, обязано принадлежать живой платформе.
  const alive = new Set(tower.platforms)
  const stray = []
  collision.query(-500, -100, -500, 500, 3000, 500, stray)

  for (const collider of stray) {
    if (collider.owner && !alive.has(collider.owner)) {
      assert.fail(`коллайдер снятой платформы остался в мире на высоте ${collider.maxY.toFixed(1)} м`)
    }
  }

  // И число сегментов не растёт бесконечно — иначе это утечка памяти.
  assert.ok(
    tower.chunkCount <= TOWER.chunksAhead + TOWER.chunksBehind + 2,
    `сегментов в памяти ${tower.chunkCount}, ожидалось не больше ${TOWER.chunksAhead + TOWER.chunksBehind + 2}`,
  )
})

test('контрольные точки расставлены с заданным шагом', () => {
  const { tower } = climb('чекпойнты', 1200)
  assert.ok(tower.checkpoints.length >= 3, `ожидалось несколько чекпойнтов, получено ${tower.checkpoints.length}`)

  const sorted = [...tower.checkpoints].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y
    assert.ok(
      Math.abs(gap - TOWER.checkpointEvery) < TOWER.stepMax * 2,
      `шаг между чекпойнтами ${gap.toFixed(1)} м далёк от ${TOWER.checkpointEvery} м`,
    )
  }
})

test('nearestCheckpoint возвращает ближайшую точку снизу', () => {
  const { tower } = climb('поиск', 900)
  const found = tower.nearestCheckpoint(600)
  assert.ok(found, 'на высоте 600 м чекпойнт ниже обязан существовать')
  assert.ok(found.y <= 600, 'чекпойнт должен быть ниже запрошенной высоты')
})
