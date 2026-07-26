/**
 * Столкновения: хранилище коллайдеров и разрешение движения тела.
 *
 * Формы — только выровненные по осям параллелепипеды. Платформы башни
 * прямоугольные, а мягкость силуэта даёт декор, который в столкновениях не
 * участвует вовсе: игроку важно, чтобы нога вставала туда, куда он целился, а
 * не чтобы его цепляла каждая веточка.
 */

const EPSILON = 1e-4

/**
 * @typedef {object} Collider
 * @property {number} minX @property {number} minY @property {number} minZ
 * @property {number} maxX @property {number} maxY @property {number} maxZ
 * @property {string} kind      'solid' | 'oneway' | 'hazard' | 'bounce' | 'crumble'
 * @property {object|null} owner Платформа-владелец: через неё берут скорость движения.
 */

/** Собирает коллайдер из центра и размеров. */
export function makeCollider(cx, cy, cz, sx, sy, sz, kind = 'solid', owner = null) {
  const hx = sx / 2
  const hy = sy / 2
  const hz = sz / 2
  return {
    minX: cx - hx,
    minY: cy - hy,
    minZ: cz - hz,
    maxX: cx + hx,
    maxY: cy + hy,
    maxZ: cz + hz,
    kind,
    owner,
    // Полуразмеры храним: по ним двигаем коллайдер, не пересчитывая из границ.
    hx,
    hy,
    hz,
    _buckets: null,
  }
}

/** Переносит коллайдер в новый центр. Для лифтов и вращающихся платформ. */
export function moveCollider(collider, cx, cy, cz) {
  collider.minX = cx - collider.hx
  collider.maxX = cx + collider.hx
  collider.minY = cy - collider.hy
  collider.maxY = cy + collider.hy
  collider.minZ = cz - collider.hz
  collider.maxZ = cz + collider.hz
}

/**
 * Хранилище коллайдеров с разбиением по высоте.
 *
 * Башня бесконечна, и перебирать все коллайдеры на каждый шаг физики нельзя.
 * Разбиение только по Y: мир вытянут вертикально, и одна координата отсекает
 * почти всё лишнее — сетка по трём осям была бы сложнее без выигрыша.
 */
export function createCollisionWorld(bucketHeight = 8) {
  /** @type {Map<number, Collider[]>} */
  const buckets = new Map()
  let count = 0

  const bucketIndex = (y) => Math.floor(y / bucketHeight)

  function add(collider) {
    const from = bucketIndex(collider.minY)
    const to = bucketIndex(collider.maxY)
    // Высокий коллайдер попадает в несколько корзин — помним, в какие именно,
    // чтобы снять его потом целиком, а не искать перебором по всей карте.
    const list = []
    for (let i = from; i <= to; i++) {
      let bucket = buckets.get(i)
      if (!bucket) {
        bucket = []
        buckets.set(i, bucket)
      }
      bucket.push(collider)
      list.push(i)
    }
    collider._buckets = list
    count++
    return collider
  }

  function remove(collider) {
    if (!collider._buckets) return
    for (const i of collider._buckets) {
      const bucket = buckets.get(i)
      if (!bucket) continue
      const at = bucket.indexOf(collider)
      if (at !== -1) bucket.splice(at, 1)
      if (bucket.length === 0) buckets.delete(i)
    }
    collider._buckets = null
    count--
  }

  /** Снимает все коллайдеры платформы — вызывается при выгрузке сегмента. */
  function removeByOwner(owner) {
    if (!owner) return
    const doomed = []
    for (const bucket of buckets.values()) {
      for (const c of bucket) if (c.owner === owner) doomed.push(c)
    }
    // Собираем сначала, удаляем потом: иначе правим массивы во время обхода.
    for (const c of new Set(doomed)) remove(c)
  }

  function clear() {
    buckets.clear()
    count = 0
  }

  /**
   * Коллайдеры, пересекающие заданный объём.
   *
   * Массив-приёмник переиспользуется вызывающей стороной: физика вызывает
   * запрос по нескольку раз за кадр, и новый массив каждый раз — это мусор.
   */
  function query(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0
    const from = bucketIndex(minY)
    const to = bucketIndex(maxY)
    for (let i = from; i <= to; i++) {
      const bucket = buckets.get(i)
      if (!bucket) continue
      for (const c of bucket) {
        if (c.maxX < minX || c.minX > maxX) continue
        if (c.maxY < minY || c.minY > maxY) continue
        if (c.maxZ < minZ || c.minZ > maxZ) continue
        // Коллайдер, лежащий в двух корзинах, встретится дважды.
        if (out.indexOf(c) === -1) out.push(c)
      }
    }
    return out
  }

  /** Верхняя грань ближайшей опоры под точкой. Нужен генератору и патрульным. */
  function raycastDown(x, z, fromY, maxDistance = 50) {
    let bestY = -Infinity
    let best = null
    const from = bucketIndex(fromY - maxDistance)
    const to = bucketIndex(fromY)
    for (let i = from; i <= to; i++) {
      const bucket = buckets.get(i)
      if (!bucket) continue
      for (const c of bucket) {
        if (c.kind === 'hazard') continue
        if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue
        if (c.maxY > fromY + EPSILON) continue
        if (c.maxY > bestY) {
          bestY = c.maxY
          best = c
        }
      }
    }
    if (!best || fromY - bestY > maxDistance) return null
    return { y: bestY, collider: best }
  }

  return {
    add,
    remove,
    removeByOwner,
    clear,
    query,
    raycastDown,
    get count() {
      return count
    },
  }
}

// Буферы уровня модуля: физика вызывается десятки раз за кадр, и выделять
// массивы под каждый запрос значит кормить сборщик мусора впустую.
const candidates = []
const touchedSet = new Set()

/**
 * Двигает тело-параллелепипед с разрешением столкновений.
 *
 * Оси разводятся по очереди Y → X → Z. Так тело корректно встаёт на опору
 * (вертикаль разрешается первой, и «пол» находится до того, как горизонталь
 * успеет вдавить тело в стену), а вдоль стен получается скольжение вместо
 * залипания: заблокированная ось не мешает свободной.
 *
 * @param {ReturnType<createCollisionWorld>} world
 * @param {{x:number,y:number,z:number}} position Точка ног. Меняется на месте.
 * @param {{x:number,y:number,z:number}} velocity Меняется на месте.
 * @param {{radius:number, height:number}} body
 * @param {number} dt
 * @param {{dropThrough?: boolean}} [opts]
 */
export function moveBody(world, position, velocity, body, dt, opts = {}) {
  const { radius, height } = body
  const dropThrough = opts.dropThrough === true

  const result = {
    grounded: false,
    ground: null,
    hitWall: false,
    hitCeiling: false,
    landedSpeed: 0,
    touched: [],
  }
  touchedSet.clear()

  const feetBefore = position.y

  // --- Перенос движущейся платформой.
  // Делаем это до всего остального: лифт, уехавший вверх, должен поднять
  // игрока, а не продавить его сквозь себя при последующем разрешении.
  const carrier = opts.carrier
  if (carrier && carrier.owner && carrier.owner.velocity) {
    position.x += carrier.owner.velocity.x * dt
    position.y += carrier.owner.velocity.y * dt
    position.z += carrier.owner.velocity.z * dt
  }

  /** Сканирует объём вокруг тела и складывает задетые опасности в результат. */
  function collect(minX, minY, minZ, maxX, maxY, maxZ) {
    world.query(minX, minY, minZ, maxX, maxY, maxZ, candidates)
    for (const c of candidates) {
      if (c.kind === 'hazard' || c.kind === 'bounce' || c.kind === 'crumble') touchedSet.add(c)
    }
    return candidates
  }

  // --- Вертикаль.
  position.y += velocity.y * dt
  {
    const minX = position.x - radius
    const maxX = position.x + radius
    const minZ = position.z - radius
    const maxZ = position.z + radius
    const list = collect(minX, position.y, minZ, maxX, position.y + height, maxZ)

    for (const c of list) {
      if (c.kind === 'hazard') continue

      if (c.kind === 'oneway') {
        // Сквозь проходимую платформу пролетают снизу и спрыгивают по команде.
        // Опорой она становится, только если тело падает и его ноги были выше
        // верхней грани до шага — иначе игрок цеплялся бы за неё в прыжке.
        if (dropThrough || velocity.y > 0) continue
        if (feetBefore < c.maxY - EPSILON) continue
      }

      if (position.y >= c.maxY || position.y + height <= c.minY) continue

      if (velocity.y <= 0 && feetBefore >= c.maxY - EPSILON) {
        position.y = c.maxY
        result.grounded = true
        result.ground = c
        result.landedSpeed = Math.min(result.landedSpeed, velocity.y)
        velocity.y = 0
      } else if (velocity.y > 0 && feetBefore + height <= c.minY + EPSILON) {
        position.y = c.minY - height
        result.hitCeiling = true
        velocity.y = 0
      }
    }
  }

  // --- Горизонталь. Обе оси разрешаются одинаково, разнесены только порядком.
  for (const axis of ['x', 'z']) {
    position[axis] += velocity[axis] * dt
    const minX = position.x - radius
    const maxX = position.x + radius
    const minZ = position.z - radius
    const maxZ = position.z + radius
    const list = collect(minX, position.y, minZ, maxX, position.y + height, maxZ)

    for (const c of list) {
      // По горизонтали проходимые платформы и шипы не мешают вовсе.
      if (c.kind === 'hazard' || c.kind === 'oneway') continue

      if (position.x + radius <= c.minX || position.x - radius >= c.maxX) continue
      if (position.z + radius <= c.minZ || position.z - radius >= c.maxZ) continue
      if (position.y >= c.maxY || position.y + height <= c.minY) continue

      // Небольшой уступ переступаем без прыжка — иначе каждый камешек
      // на платформе останавливал бы бег.
      const step = c.maxY - position.y
      if (result.grounded && step > 0 && step <= (body.stepHeight ?? 0)) {
        position.y = c.maxY
        continue
      }

      if (axis === 'x') {
        const fromLeft = velocity.x > 0
        position.x = fromLeft ? c.minX - radius : c.maxX + radius
        velocity.x = 0
      } else {
        const fromFront = velocity.z > 0
        position.z = fromFront ? c.minZ - radius : c.maxZ + radius
        velocity.z = 0
      }
      result.hitWall = true
    }
  }

  // --- Опора под ногами.
  // Проверяем отдельно от вертикального шага: после разрешения горизонтали
  // тело может съехать с края, и без этой проверки оно ещё кадр считалось бы
  // стоящим на земле — прыжок «из воздуха» был бы виден невооружённым глазом.
  if (!result.grounded && velocity.y <= 0) {
    const probe = 0.06
    world.query(
      position.x - radius,
      position.y - probe,
      position.z - radius,
      position.x + radius,
      position.y + EPSILON,
      position.z + radius,
      candidates,
    )
    for (const c of candidates) {
      if (c.kind === 'hazard') continue
      if (c.kind === 'oneway' && dropThrough) continue
      if (c.maxY <= position.y + EPSILON && c.maxY >= position.y - probe) {
        position.y = c.maxY
        result.grounded = true
        result.ground = c
        break
      }
    }
  }

  for (const c of touchedSet) result.touched.push(c)
  if (result.ground && (result.ground.kind === 'bounce' || result.ground.kind === 'crumble')) {
    if (result.touched.indexOf(result.ground) === -1) result.touched.push(result.ground)
  }
  return result
}
