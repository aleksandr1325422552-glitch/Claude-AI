import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toon, glow } from '../render/materials.js'
import { TAU } from '../core/util.js'

/**
 * Меши платформ.
 *
 * Ни одна функция здесь не трогает сцену — только строит объекты. Расстановкой
 * занимается генератор, и такое разделение позволяет ему держать пул готовых
 * платформ, не зная, как они устроены внутри.
 *
 * Общий приём для всего камня: берём примитив с малым числом сегментов, сдвигаем
 * вершины псевдослучайно и пересчитываем нормали как плоские. Получается
 * рублёный гранёный камень вместо гладкой болванки — и ровно этого требует
 * мультяшный стиль, где форму читают по граням, а не по текстуре.
 */

/**
 * Палитра меняется каждый кадр, а материалы кэшируются по цвету — без
 * огрубления кэш разрастался бы бесконечно. Шаг в 8 уровней на канал глазом
 * не различим, зато число материалов остаётся конечным.
 */
function quantize(color) {
  const q = (v) => (Math.round(v * 255 / 8) * 8) & 0xff
  return (q(color.r) << 16) | (q(color.g) << 8) | q(color.b)
}

/** Сдвигает вершины геометрии по псевдослучайному шуму и делает грани плоскими. */
function facet(geometry, rng, amount) {
  const pos = geometry.attributes.position
  // Вершины, совпадающие в пространстве, обязаны сдвинуться одинаково, иначе
  // в оболочке разойдутся швы. Ключ — округлённые координаты.
  const shifts = new Map()
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
    let shift = shifts.get(key)
    if (!shift) {
      shift = [rng.spread(amount), rng.spread(amount * 0.6), rng.spread(amount)]
      shifts.set(key, shift)
    }
    pos.setXYZ(i, v.x + shift[0], v.y + shift[1], v.z + shift[2])
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Склеивает список мешей в один на материал — платформ в кадре десятки. */
function mergeByMaterial(meshes) {
  const byMaterial = new Map()
  for (const mesh of meshes) {
    mesh.updateMatrix()
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix)
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
    }
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, [])
    byMaterial.get(mesh.material).push(geometry)
  }

  const group = new THREE.Group()
  for (const [material, list] of byMaterial) {
    const merged = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}

/** Гранёная скальная тумба: широкая сверху, сужающаяся книзу. */
function rockBody(radius, height, rng, palette, sides = 7) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.62, height, sides, 2)
  facet(geometry, rng, radius * 0.13)
  const mesh = new THREE.Mesh(geometry, toon(quantize(palette.rock)))
  // Тумбу опускаем под шапку травы. Их верхние грани лежали в одной плоскости,
  // и шум по вершинам выталкивал камень сквозь траву — платформа покрывалась
  // коричневыми проплешинами там, где его выперло выше.
  mesh.position.y = -height / 2 - 0.18
  return mesh
}

/**
 * Шапка травы или снега поверх тумбы — она же видимая поверхность платформы.
 *
 * Шапка заметно шире тумбы, и шум по её вершинам почти выключен. Иначе тумба
 * и шапка расходятся независимо, камень проступает между зелёными гранями, и
 * платформа выглядит нарезанным пирогом вместо холма.
 */
function capMesh(radius, rng, palette, sides = 7) {
  const geometry = new THREE.CylinderGeometry(radius * 1.09, radius * 1.05, 0.5, sides, 1)
  facet(geometry, rng, radius * 0.015)
  const mesh = new THREE.Mesh(geometry, toon(quantize(palette.foliage)))
  mesh.position.y = -0.25
  return mesh
}

/**
 * Габаритный радиус платформы по её виду и размеру.
 *
 * Вынесен отдельно от построения намеренно: генератору радиус нужен ДО того,
 * как платформа построена, — он проверяет по нему достижимость. Пока это была
 * одна формула внутри buildPlatform, генератор считал по номинальному size, и
 * узкие виды (столб, мост) на деле оказывались дальше, чем он полагал.
 */
export function platformRadius(kind, size) {
  switch (kind) {
    case 'bridge':
      return size * 1.2
    case 'pillar':
      return Math.max(1.1, size * 0.42)
    case 'bounce':
      return size * 0.85
    default:
      return size
  }
}

/**
 * Строит платформу заданного вида.
 *
 * Координаты коллайдеров — локальные относительно меша: генератор ставит меш
 * куда нужно и переносит коллайдеры тем же смещением.
 *
 * @param {string} kind 'rock'|'disc'|'bridge'|'pillar'|'crumble'|'bounce'|'spike'|'lift'|'rotator'
 * @param {{size?: number}} params
 * @param {object} rng
 * @param {object} palette
 */
export function buildPlatform(kind, params, rng, palette) {
  const size = params.size ?? 4
  const parts = []
  const boxes = []
  const spawnPoints = []
  // Радиус берём из общей формулы, а не выводим здесь заново: генератор
  // проверяет достижимость по ней же, и разойтись они не должны.
  let radius = platformRadius(kind, size)
  const extras = new THREE.Group()

  switch (kind) {
    case 'bridge': {
      // Узкий мост: намеренно неудобная, «нервная» платформа.
      const length = size * 2.4
      const width = Math.max(1.5, size * 0.42)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, width), toon(quantize(palette.rock)))
      deck.position.y = -0.25
      parts.push(deck)
      // Перила намекают, что по мосту надо бежать, а не топтаться.
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(length, 0.16, 0.16),
          toon(quantize(palette.rockDeep)),
        )
        rail.position.set(0, 0.28, (side * width) / 2)
        parts.push(rail)
      }
      boxes.push({ cx: 0, cy: -0.25, cz: 0, sx: length, sy: 0.5, sz: width, kind: 'solid' })
      spawnPoints.push({ x: 0, y: 0, z: 0 })
      break
    }

    case 'pillar': {
      const r = Math.max(1.1, size * 0.42)
      parts.push(rockBody(r, 6, rng, palette, 6))
      parts.push(capMesh(r, rng, palette, 6))
      boxes.push({ cx: 0, cy: -3, cz: 0, sx: r * 1.7, sy: 6, sz: r * 1.7, kind: 'solid' })
      spawnPoints.push({ x: 0, y: 0, z: 0 })
      break
    }

    case 'disc': {
      const geometry = new THREE.CylinderGeometry(size, size * 0.9, 0.7, 12, 1)
      facet(geometry, rng, size * 0.05)
      const disc = new THREE.Mesh(geometry, toon(quantize(palette.rock)))
      // Так же, как у скальной тумбы: камень уходит под траву, а не вровень с ней.
      disc.position.y = -0.53
      parts.push(disc)
      parts.push(capMesh(size, rng, palette, 12))
      boxes.push({ cx: 0, cy: -0.35, cz: 0, sx: size * 1.8, sy: 0.7, sz: size * 1.8, kind: 'solid' })
      spawnPoints.push({ x: 0, y: 0, z: 0 })
      break
    }

    case 'crumble': {
      // Осыпающаяся: холодный треснувший камень без травы — вид предупреждает,
      // что стоять на ней нельзя, ещё до того как она начнёт сыпаться.
      const geometry = new THREE.CylinderGeometry(size, size * 0.7, 0.9, 6, 1)
      facet(geometry, rng, size * 0.16)
      const body = new THREE.Mesh(geometry, toon(quantize(palette.rockDeep)))
      body.position.y = -0.45
      parts.push(body)
      for (let i = 0; i < 3; i++) {
        const crack = new THREE.Mesh(
          new THREE.BoxGeometry(size * 1.4, 0.06, 0.09),
          toon(quantize(palette.rock)),
        )
        crack.position.set(rng.spread(size * 0.3), 0.02, rng.spread(size * 0.5))
        crack.rotation.y = rng.next() * TAU
        parts.push(crack)
      }
      boxes.push({ cx: 0, cy: -0.45, cz: 0, sx: size * 1.6, sy: 0.9, sz: size * 1.6, kind: 'crumble' })
      break
    }

    case 'bounce': {
      // Батут-гриб: шляпка акцентного цвета — единственное, что здесь ярко
      // светится, поэтому её замечают издалека и целятся именно в неё.
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.3, size * 0.42, 1.4, 8),
        toon(quantize(palette.rockDeep)),
      )
      stem.position.y = -0.7
      parts.push(stem)
      const capGeometry = new THREE.SphereGeometry(size * 0.85, 12, 8, 0, TAU, 0, Math.PI / 2)
      const cap = new THREE.Mesh(capGeometry, toon(quantize(palette.accent), { rim: 1.6 }))
      cap.position.y = -0.05
      cap.scale.y = 0.55
      parts.push(cap)
      boxes.push({ cx: 0, cy: -0.3, cz: 0, sx: size * 1.3, sy: 0.6, sz: size * 1.3, kind: 'bounce' })
      break
    }

    case 'spike': {
      parts.push(rockBody(size, 2.4, rng, palette))
      parts.push(capMesh(size, rng, palette))
      boxes.push({ cx: 0, cy: -1.2, cz: 0, sx: size * 1.7, sy: 2.4, sz: size * 1.7, kind: 'solid' })

      // Шипы ставим кольцом по краю, оставляя середину безопасной: платформа
      // проходима, но требует точного приземления — это интереснее, чем
      // площадка, на которую просто нельзя вставать.
      const spikeCount = Math.max(4, Math.round(size * 1.6))
      for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * TAU + rng.spread(0.2)
        const dist = size * 0.72
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 1.05, 5),
          toon(quantize(palette.rockDeep), { rim: 1.4 }),
        )
        spike.position.set(Math.cos(angle) * dist, 0.52, Math.sin(angle) * dist)
        parts.push(spike)
        boxes.push({
          cx: Math.cos(angle) * dist,
          cy: 0.52,
          cz: Math.sin(angle) * dist,
          sx: 0.5,
          sy: 1.05,
          sz: 0.5,
          kind: 'hazard',
        })
      }
      spawnPoints.push({ x: 0, y: 0, z: 0 })
      break
    }

    case 'lift':
    case 'rotator': {
      const geometry = new THREE.CylinderGeometry(size, size * 0.85, 0.8, 8, 1)
      facet(geometry, rng, size * 0.05)
      const body = new THREE.Mesh(geometry, toon(quantize(palette.rock)))
      body.position.y = -0.4
      parts.push(body)
      parts.push(capMesh(size, rng, palette, 8))
      // Светящееся кольцо снизу отличает движущуюся платформу от неподвижной.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.75, 0.08, 6, 18), glow(quantize(palette.accent)))
      ring.rotation.x = Math.PI / 2
      ring.position.y = -0.85
      parts.push(ring)
      boxes.push({ cx: 0, cy: -0.4, cz: 0, sx: size * 1.7, sy: 0.8, sz: size * 1.7, kind: 'solid' })
      spawnPoints.push({ x: 0, y: 0, z: 0 })
      break
    }

    case 'rock':
    default: {
      parts.push(rockBody(size, 3.2, rng, palette))
      parts.push(capMesh(size, rng, palette))
      boxes.push({ cx: 0, cy: -1.6, cz: 0, sx: size * 1.7, sy: 3.2, sz: size * 1.7, kind: 'solid' })
      // Пара валунов сбоку разбивает силуэт, чтобы платформы не выглядели
      // штампованными. В столкновениях они не участвуют — только украшают.
      const boulders = rng.int(0, 2)
      for (let i = 0; i < boulders; i++) {
        const angle = rng.next() * TAU
        const geometry = new THREE.IcosahedronGeometry(rng.range(0.35, 0.7), 0)
        facet(geometry, rng, 0.12)
        const boulder = new THREE.Mesh(geometry, toon(quantize(palette.rockDeep)))
        boulder.position.set(Math.cos(angle) * size * 0.7, 0.1, Math.sin(angle) * size * 0.7)
        parts.push(boulder)
      }
      spawnPoints.push({ x: 0, y: 0, z: 0 })
      break
    }
  }

  // Точки под врагов и пикапы: середина и пара мест ближе к краю.
  if (spawnPoints.length && radius > 2.2) {
    for (let i = 0; i < 2; i++) {
      const angle = rng.next() * TAU
      spawnPoints.push({ x: Math.cos(angle) * radius * 0.5, y: 0, z: Math.sin(angle) * radius * 0.5 })
    }
  }

  const mesh = mergeByMaterial(parts)
  if (extras.children.length) mesh.add(extras)

  return { mesh, boxes, radius, spawnPoints }
}
