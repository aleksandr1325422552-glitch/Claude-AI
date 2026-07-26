import * as THREE from 'three'
import { createRng, createNoise1d } from '../core/rng.js'
import { makeCollider, moveCollider } from './collision.js'
import { buildPlatform, platformRadius } from './platforms.js'
import { buildTree, buildBush, buildCrystalCluster, buildRubble, buildGrassPatch, buildCheckpointBeacon } from './props.js'
import { PHYSICS, TOWER, ENEMY, PICKUP } from '../game/config.js'
import { clamp, clamp01, lerp, TAU } from '../core/util.js'

/**
 * Бесконечная процедурная башня.
 *
 * Мир строится сегментами по мере подъёма и разбирается за спиной. Главное
 * требование — проходимость: платформа, до которой нельзя допрыгнуть, обрывает
 * забег без вины игрока. Поэтому дальность прыжка здесь не подбирается на глаз,
 * а считается из тех же чисел PHYSICS, по которым живёт игрок.
 */

/** Высота, на которую поднимается одиночный прыжок. */
export function jumpApex() {
  return (PHYSICS.jumpSpeed * PHYSICS.jumpSpeed) / (2 * -PHYSICS.gravity)
}

/**
 * Насколько далеко по горизонтали можно улететь, поднимаясь на `dy` метров.
 *
 * Считаем честно: время подъёма до апекса плюс время падения от апекса до
 * нужной высоты (падение идёт с усиленной гравитацией — см. fallGravityScale),
 * и всё это умножаем на скорость бега.
 *
 * @returns {number} Дальность в метрах; 0, если такая высота недостижима.
 */
export function jumpReach(dy) {
  const g = -PHYSICS.gravity
  const apex = jumpApex()
  if (dy >= apex) return 0

  const timeUp = PHYSICS.jumpSpeed / g
  const timeDown = Math.sqrt((2 * (apex - dy)) / (g * PHYSICS.fallGravityScale))
  return PHYSICS.runSpeed * (timeUp + timeDown)
}

/**
 * Запас прочности при расстановке.
 *
 * Игрок не выходит на платформу с идеальной скоростью и не целится идеально,
 * поэтому берём заметно меньше теоретического максимума. Без запаса каждая
 * вторая платформа требовала бы кадрового исполнения.
 */
const REACH_SAFETY = 0.62

/** Достижима ли платформа B из платформы A по расчёту прыжка. */
export function isReachable(from, to) {
  const dy = to.y - from.y
  if (dy <= 0) return true
  const reach = jumpReach(dy)
  if (reach <= 0) return false
  const dx = to.x - from.x
  const dz = to.z - from.z
  const horizontal = Math.hypot(dx, dz)
  // Из дистанции вычитаем радиусы: прыгают с края на край, а не из центра в центр.
  const gap = Math.max(0, horizontal - (from.radius ?? 0) - (to.radius ?? 0))
  return gap <= reach * REACH_SAFETY
}

/** Виды платформ и их вес в зависимости от сложности (0 внизу, 1 наверху). */
function pickKind(rng, difficulty) {
  const kinds = ['rock', 'disc', 'bridge', 'pillar', 'crumble', 'bounce', 'spike', 'lift', 'rotator']
  const weights = [
    lerp(5, 1.6, difficulty),
    lerp(4, 1.4, difficulty),
    lerp(0.5, 1.6, difficulty),
    lerp(0.4, 1.5, difficulty),
    lerp(0, 1.9, difficulty),
    lerp(0.6, 1.2, difficulty),
    lerp(0, 1.5, difficulty),
    lerp(0, 1.7, difficulty),
    lerp(0, 1.1, difficulty),
  ]
  return rng.weighted(kinds, weights)
}

/**
 * @param {THREE.Scene} scene
 * @param {ReturnType<import('./collision.js').createCollisionWorld>} collision
 */
export function createTower(scene, collision, opts = {}) {
  const root = new THREE.Group()
  scene.add(root)

  let seed = opts.seed ?? 'ввысь'
  let rng = createRng(seed)
  let radiusNoise = createNoise1d(`${seed}:радиус`)
  let angleNoise = createNoise1d(`${seed}:угол`)

  /** @type {Map<number, object>} Построенные сегменты по индексу. */
  const chunks = new Map()
  const platforms = []
  const checkpoints = []
  const spawnQueue = []

  // Палитра на момент постройки сегмента: мир строится вперёд, и красить его
  // надо цветом той высоты, где он окажется, а не той, где сейчас игрок.
  let paletteRef = null

  const startPoint = { x: 0, y: 0, z: 0 }

  /**
   * Опорная точка для расчёта достижимости следующей платформы.
   *
   * Это снимок координат на момент постройки, а не ссылка на саму платформу.
   * Лифты и вращающиеся площадки меняют свои координаты каждый кадр, и живая
   * ссылка сделала бы генерацию зависимой от того, в какой фазе движения
   * оказалась платформа, когда достраивался следующий сегмент. Башня перестала
   * бы воспроизводиться по сиду — ровно то, ради чего заведён детерминированный
   * генератор случайных чисел.
   */
  let lastPlatform = null

  /**
   * Ставит платформу и регистрирует её коллайдеры.
   * Возвращает описание, пригодное для проверки достижимости.
   */
  function placePlatform(kind, x, y, z, size, chunkIndex, chunkRng) {
    const build = buildPlatform(kind, { size }, chunkRng, paletteRef)
    build.mesh.position.set(x, y, z)
    root.add(build.mesh)

    const platform = {
      kind,
      x,
      y,
      z,
      radius: build.radius,
      mesh: build.mesh,
      chunkIndex,
      colliders: [],
      // Движущиеся платформы получают скорость, которую физика переносит на игрока.
      velocity: kind === 'lift' || kind === 'rotator' ? new THREE.Vector3() : null,
      phase: chunkRng.next() * TAU,
      amplitude: kind === 'lift' ? chunkRng.range(1.6, 3.4) : 0,
      speed: chunkRng.range(0.5, 1.1),
      baseY: y,
      baseX: x,
      baseZ: z,
      crumbleTimer: -1,
      alive: true,
    }

    for (const box of build.boxes) {
      const collider = makeCollider(
        x + box.cx,
        y + box.cy,
        z + box.cz,
        box.sx,
        box.sy,
        box.sz,
        box.kind,
        platform,
      )
      collision.add(collider)
      platform.colliders.push({ collider, offset: box })
    }

    // Декор ставим только на платформы, где есть где его поставить.
    if (build.radius > 2 && kind !== 'crumble' && kind !== 'bounce') {
      decorate(platform, build, chunkRng)
    }

    // Точки под врагов и пикапы отдаём наружу — их разбирает главный цикл.
    const difficulty = clamp01(y / 3000)
    for (const point of build.spawnPoints) {
      const wx = x + point.x
      const wy = y + 0.2
      const wz = z + point.z

      if (kind !== 'spike' && chunkRng.chance(clamp(ENEMY.densityPerHundred * (y / 100), 0, ENEMY.maxDensity) * 0.35)) {
        const enemyKind = chunkRng.weighted(
          ['chaser', 'patrol', 'spitter'],
          [lerp(1, 2.4, difficulty), build.radius > 2.6 ? 2 : 0, lerp(0.3, 1.6, difficulty)],
        )
        spawnQueue.push({ type: 'enemy', kind: enemyKind, x: wx, y: wy, z: wz })
      } else if (chunkRng.chance(PICKUP.crystalsPerChunk / 8)) {
        const pickKindName = chunkRng.weighted(['crystal', 'stamina', 'heart'], [7, 2.2, 0.35])
        spawnQueue.push({ type: 'pickup', kind: pickKindName, x: wx, y: wy + 1, z: wz })
      }
    }

    platforms.push(platform)
    return platform
  }

  /** Раскидывает по платформе траву, деревья, кусты и кристаллы. */
  function decorate(platform, build, chunkRng) {
    const r = build.radius
    const decor = new THREE.Group()

    // Плотность травы растёт как площадь платформы: на широкой площадке
    // редкие пучки смотрятся проплешинами, а не лугом.
    const grassCount = Math.round(r * r * 11)
    if (grassCount > 4) decor.add(buildGrassPatch(grassCount, r * 0.95, chunkRng, paletteRef))

    const trees = chunkRng.int(0, r > 3.4 ? 2 : 1)
    for (let i = 0; i < trees; i++) {
      const tree = buildTree(chunkRng, paletteRef)
      const angle = chunkRng.next() * TAU
      const dist = chunkRng.range(0.2, r * 0.62)
      tree.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
      decor.add(tree)
    }

    for (let i = 0, n = chunkRng.int(0, 2); i < n; i++) {
      const bush = buildBush(chunkRng, paletteRef)
      const angle = chunkRng.next() * TAU
      const dist = chunkRng.range(0.3, r * 0.75)
      bush.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
      decor.add(bush)
    }

    if (chunkRng.chance(0.28)) {
      const crystals = buildCrystalCluster(chunkRng, paletteRef)
      const angle = chunkRng.next() * TAU
      crystals.position.set(Math.cos(angle) * r * 0.6, 0, Math.sin(angle) * r * 0.6)
      decor.add(crystals)
    }

    if (chunkRng.chance(0.35)) {
      const rubble = buildRubble(chunkRng, paletteRef)
      const angle = chunkRng.next() * TAU
      rubble.position.set(Math.cos(angle) * r * 0.7, 0, Math.sin(angle) * r * 0.7)
      decor.add(rubble)
    }

    platform.mesh.add(decor)
  }

  /**
   * Строит один сегмент башни.
   *
   * Собственный поток случайных чисел на сегмент — обязателен: иначе содержимое
   * сегмента зависело бы от того, сколько платформ сгенерировалось до него, и
   * один сид переставал бы давать одну и ту же башню.
   */
  function buildChunk(index) {
    if (chunks.has(index)) return chunks.get(index)

    const chunkRng = rng.fork(`сегмент:${index}`)
    const baseY = index * TOWER.chunkHeight
    const topY = baseY + TOWER.chunkHeight
    const chunk = { index, platforms: [], beacons: [] }

    // Первые полторы сотни метров — обучение: широкие площадки, ровный шаг.
    const difficulty = clamp01((baseY - 150) / 2600)

    // Отсчёт ведём от последней поставленной платформы, а не от нижней границы
    // сегмента. Иначе на каждом стыке возникает разрыв: предыдущий сегмент
    // закончился чуть ниже границы, новый начинает свой первый шаг от неё — и
    // суммарный подъём через стык выходит вдвое больше допустимого.
    let y = baseY
    if (lastPlatform && lastPlatform.y >= baseY - TOWER.chunkHeight && lastPlatform.y < topY) {
      y = lastPlatform.y
    }
    // Угол по спирали привязан к высоте, поэтому соседние сегменты стыкуются
    // без разрывов независимо от порядка постройки.
    let angle = baseY * 0.11 + angleNoise(baseY * 0.02) * 1.4

    while (y < topY) {
      const step = lerp(TOWER.stepMax, TOWER.stepMin, chunkRng.next() * difficulty)
      y += step
      if (y >= topY) break

      const isCheckpoint = Math.floor(y / TOWER.checkpointEvery) > Math.floor((y - step) / TOWER.checkpointEvery)

      angle += chunkRng.range(0.5, 1.25)
      const radius = lerp(
        TOWER.radiusMin,
        TOWER.radiusMax,
        clamp01((radiusNoise(y * 0.035) + 1) * 0.5),
      )

      let x = Math.cos(angle) * radius
      let z = Math.sin(angle) * radius
      let size = isCheckpoint ? 5.5 : lerp(4.2, 2.1, difficulty * chunkRng.range(0.6, 1))
      let kind = isCheckpoint ? 'disc' : pickKind(chunkRng, difficulty)

      // Гарантия проходимости: если следующая точка не берётся прыжком, тянем
      // её к предыдущей платформе, пока не станет достижимой. Проверка идёт по
      // той же формуле, что и физика игрока, поэтому не может разойтись с ней.
      // Радиус берём фактический для выбранного вида: у столба и моста он
      // заметно отличается от номинального размера, и проверка по size
      // разрешала бы прыжки, которых на деле не существует.
      const actualRadius = platformRadius(kind, size)
      if (lastPlatform) {
        let guard = 0
        while (!isReachable(lastPlatform, { x, y, z, radius: actualRadius }) && guard < 24) {
          x = lerp(x, lastPlatform.x, 0.22)
          z = lerp(z, lastPlatform.z, 0.22)
          guard++
        }
        // Если и это не помогло (слишком большой подъём) — опускаем платформу.
        if (!isReachable(lastPlatform, { x, y, z, radius: actualRadius })) {
          y = lastPlatform.y + TOWER.stepMin
        }
      }

      const platform = placePlatform(kind, x, y, z, size, index, chunkRng)
      chunk.platforms.push(platform)
      lastPlatform = { x, y, z, radius: platform.radius }

      if (isCheckpoint) {
        const beacon = buildCheckpointBeacon(paletteRef)
        beacon.mesh.position.set(x, y, z)
        root.add(beacon.mesh)
        chunk.beacons.push(beacon)
        checkpoints.push({ x, y, z, reached: false, beacon })
      }
    }

    chunks.set(index, chunk)
    return chunk
  }

  /** Снимает сегмент: убирает меши со сцены и освобождает коллайдеры. */
  function dropChunk(index) {
    const chunk = chunks.get(index)
    if (!chunk) return

    for (const platform of chunk.platforms) {
      // Коллайдеры обязаны уйти вместе с мешем, иначе игрок будет спотыкаться
      // о невидимые платформы, которых давно нет в кадре.
      collision.removeByOwner(platform)
      root.remove(platform.mesh)
      platform.mesh.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose()
      })
      const at = platforms.indexOf(platform)
      if (at !== -1) platforms.splice(at, 1)
      platform.alive = false
    }
    for (const beacon of chunk.beacons) root.remove(beacon.mesh)
    chunks.delete(index)
  }

  /** Строит стартовую площадку и первые сегменты. */
  function prime(palette) {
    paletteRef = palette
    const startRng = rng.fork('старт')
    const start = placePlatform('disc', 0, 0, 0, 7, -1, startRng)
    // Стартовая площадка обязана жить в сегменте, как и все прочие: иначе её
    // меш и коллайдер остаются в памяти до конца забега, а игрок далеко
    // наверху продолжает платить за невидимую платформу под собой.
    chunks.set(-1, { index: -1, platforms: [start], beacons: [] })
    lastPlatform = { x: 0, y: 0, z: 0, radius: start.radius }
    startPoint.x = 0
    startPoint.y = 0.2
    startPoint.z = 0
    for (let i = 0; i <= TOWER.chunksAhead; i++) buildChunk(i)
  }

  /**
   * Достраивает верх, снимает низ, двигает подвижные платформы.
   *
   * @param {number} playerY
   * @param {number} dt
   */
  function update(playerY, dt) {
    const current = Math.floor(playerY / TOWER.chunkHeight)

    for (let i = current; i <= current + TOWER.chunksAhead; i++) {
      if (i >= 0) buildChunk(i)
    }

    for (const index of [...chunks.keys()]) {
      if (index < current - TOWER.chunksBehind) dropChunk(index)
    }

    for (const platform of platforms) {
      if (!platform.velocity) continue

      if (platform.kind === 'lift') {
        const y = platform.baseY + Math.sin(platform.phase + performanceTime * platform.speed) * platform.amplitude
        // Скорость платформы нужна физике: без неё стоящий на лифте игрок
        // остался бы висеть в воздухе, пока платформа уезжает вверх.
        platform.velocity.set(0, (y - platform.mesh.position.y) / Math.max(dt, 1e-4), 0)
        platform.mesh.position.y = y
        platform.y = y
        for (const { collider, offset } of platform.colliders) {
          moveCollider(collider, platform.x + offset.cx, y + offset.cy, platform.z + offset.cz)
        }
      } else if (platform.kind === 'rotator') {
        const angle = platform.phase + performanceTime * platform.speed * 0.6
        const orbit = 2.6
        const x = platform.baseX + Math.cos(angle) * orbit
        const z = platform.baseZ + Math.sin(angle) * orbit
        platform.velocity.set(
          (x - platform.mesh.position.x) / Math.max(dt, 1e-4),
          0,
          (z - platform.mesh.position.z) / Math.max(dt, 1e-4),
        )
        platform.mesh.position.x = x
        platform.mesh.position.z = z
        platform.x = x
        platform.z = z
        for (const { collider, offset } of platform.colliders) {
          moveCollider(collider, x + offset.cx, platform.y + offset.cy, z + offset.cz)
        }
      }
    }

    // Осыпающиеся платформы: таймер запускает игрок, наступив на неё.
    for (const platform of platforms) {
      if (platform.crumbleTimer < 0) continue
      platform.crumbleTimer -= dt
      // Дрожь предупреждает, что пора уходить.
      platform.mesh.position.x = platform.baseX + Math.sin(platform.crumbleTimer * 40) * 0.06
      if (platform.crumbleTimer <= 0) {
        platform.crumbleTimer = -1
        platform.mesh.visible = false
        collision.removeByOwner(platform)
      }
    }

    for (const chunk of chunks.values()) {
      for (const beacon of chunk.beacons) beacon.update(dt)
    }
  }

  // Собственное время генератора: performance.now() в шаге физики использовать
  // нельзя — фиксированный шаг обязан зависеть только от dt.
  let performanceTime = 0
  const tick = (dt) => {
    performanceTime += dt
  }

  /** Запускает осыпание платформы, на которую наступили. */
  function triggerCrumble(platform, delay = 0.45) {
    if (!platform || platform.kind !== 'crumble' || platform.crumbleTimer >= 0) return false
    platform.crumbleTimer = delay
    return true
  }

  function nearestCheckpoint(y) {
    let best = null
    for (const c of checkpoints) {
      if (c.y > y) continue
      if (!best || c.y > best.y) best = c
    }
    return best
  }

  function reset(newSeed) {
    for (const index of [...chunks.keys()]) dropChunk(index)
    // Стартовая площадка живёт вне сегментов — снимаем её отдельно.
    for (const platform of [...platforms]) {
      collision.removeByOwner(platform)
      root.remove(platform.mesh)
      platforms.splice(platforms.indexOf(platform), 1)
    }
    checkpoints.length = 0
    spawnQueue.length = 0
    chunks.clear()
    lastPlatform = null
    performanceTime = 0

    seed = newSeed ?? seed
    rng = createRng(seed)
    radiusNoise = createNoise1d(`${seed}:радиус`)
    angleNoise = createNoise1d(`${seed}:угол`)
    if (paletteRef) prime(paletteRef)
  }

  function dispose() {
    for (const index of [...chunks.keys()]) dropChunk(index)
    scene.remove(root)
  }

  return {
    root,
    prime,
    update,
    tick,
    triggerCrumble,
    platforms,
    spawnQueue,
    checkpoints,
    nearestCheckpoint,
    startPoint,
    reset,
    dispose,
    get chunkCount() {
      return chunks.size
    },
  }
}
