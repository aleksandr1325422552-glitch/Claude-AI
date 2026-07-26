import * as THREE from 'three'
import { toon, glow, veil } from '../render/materials.js'
import { TAU } from '../core/util.js'

/**
 * Декор платформ: деревья, кусты, кристаллы, флаги, маяки чекпойнтов.
 *
 * Ничто отсюда не участвует в столкновениях — это чистое оформление. Такое
 * разделение принципиально: игрок должен видеть край платформы там, где он
 * есть, а не там, где кончается крона дерева.
 */

/** Огрубление цвета — палитра плывёт каждый кадр, а материалы кэшируются по нему. */
function quantize(color) {
  const q = (v) => (Math.round((v * 255) / 8) * 8) & 0xff
  return (q(color.r) << 16) | (q(color.g) << 8) | q(color.b)
}

/** Тёплый или холодный сдвиг оттенка — чтобы соседние кусты не были близнецами. */
function shifted(color, amount) {
  const c = color.clone()
  c.offsetHSL(amount * 0.04, 0, amount * 0.06)
  return quantize(c)
}

/**
 * Дерево: гранёный ствол и две-три сплюснутые кроны.
 *
 * Ствол намеренно слегка наклонён — строго вертикальные деревья выдают
 * процедурную расстановку и делают мир мёртвым.
 */
export function buildTree(rng, palette) {
  const group = new THREE.Group()
  const height = rng.range(2.2, 3.8)

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.055, height * 0.11, height, 5),
    toon(shifted(palette.rockDeep, 0.5)),
  )
  trunk.position.y = height / 2
  trunk.castShadow = true
  group.add(trunk)

  const crowns = rng.int(2, 3)
  for (let i = 0; i < crowns; i++) {
    const t = i / crowns
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(height * (0.46 - t * 0.13), 0),
      toon(shifted(palette.foliage, rng.spread(1))),
    )
    crown.position.set(rng.spread(0.18), height * (0.72 + t * 0.34), rng.spread(0.18))
    crown.scale.y = rng.range(0.7, 0.95)
    crown.rotation.y = rng.next() * TAU
    crown.castShadow = true
    group.add(crown)
  }

  group.rotation.z = rng.spread(0.09)
  group.rotation.x = rng.spread(0.09)
  return group
}

/** Куст: два-три мелких многогранника у самой земли. */
export function buildBush(rng, palette) {
  const group = new THREE.Group()
  const blobs = rng.int(2, 3)
  for (let i = 0; i < blobs; i++) {
    const r = rng.range(0.3, 0.55)
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(shifted(palette.foliage, rng.spread(1))))
    blob.position.set(rng.spread(0.4), r * 0.75, rng.spread(0.4))
    blob.scale.y = 0.8
    blob.castShadow = true
    group.add(blob)
  }
  return group
}

/** Друза кристаллов: вытянутые октаэдры под разными углами. */
export function buildCrystalCluster(rng, palette) {
  const group = new THREE.Group()
  const material = glow(quantize(palette.accent))
  const count = rng.int(2, 4)

  for (let i = 0; i < count; i++) {
    const h = rng.range(0.5, 1.3)
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.3, 0), material)
    crystal.scale.y = h / (h * 0.3) / 2
    const angle = rng.next() * TAU
    const dist = rng.range(0, 0.5)
    crystal.position.set(Math.cos(angle) * dist, h * 0.45, Math.sin(angle) * dist)
    crystal.rotation.set(rng.spread(0.35), rng.next() * TAU, rng.spread(0.35))
    group.add(crystal)
  }

  // Слабое свечение у основания: оно объясняет, откуда на камне цветной отсвет.
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), veil(quantize(palette.accent), 0.22))
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.03
  group.add(halo)
  return group
}

/** Флаг на шесте — ориентир, отмечающий безопасное место. */
export function buildBanner(rng, palette) {
  const group = new THREE.Group()
  const height = rng.range(1.8, 2.6)

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, height, 5), toon(quantize(palette.rockDeep)))
  pole.position.y = height / 2
  group.add(pole)

  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.5),
    toon(quantize(palette.accent), { side: THREE.DoubleSide, rim: 1.4 }),
  )
  cloth.position.set(0.42, height * 0.82, 0)
  group.add(cloth)
  group.userData.cloth = cloth
  return group
}

/** Груда камней — заполняет пустые места на широких площадках. */
export function buildRubble(rng, palette) {
  const group = new THREE.Group()
  const count = rng.int(2, 4)
  for (let i = 0; i < count; i++) {
    const r = rng.range(0.15, 0.4)
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(shifted(palette.rock, rng.spread(1))))
    stone.position.set(rng.spread(0.6), r * 0.7, rng.spread(0.6))
    stone.rotation.set(rng.next() * TAU, rng.next() * TAU, rng.next() * TAU)
    stone.castShadow = true
    group.add(stone)
  }
  return group
}

/**
 * Маяк контрольной точки.
 *
 * Пока не активирован — тёмный и неподвижный; после активации загорается и
 * начинает вращать кольцо. Разница должна быть видна издалека: чекпойнт — это
 * единственное место в игре, где можно выдохнуть.
 */
export function buildCheckpointBeacon(palette) {
  const group = new THREE.Group()
  const accent = quantize(palette.accent)

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.4, 8), toon(quantize(palette.rockDeep)))
  base.position.y = 0.2
  base.castShadow = true
  group.add(base)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 6), toon(quantize(palette.rockDeep)))
  column.position.y = 1.5
  column.castShadow = true
  group.add(column)

  const bowl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), toon(quantize(palette.rock)))
  bowl.position.y = 2.85
  group.add(bowl)

  // Огонь и кольцо созданы сразу, но спрятаны: создавать меши в момент
  // активации — верный способ поймать рывок ровно в кадре с эффектом.
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), glow(accent))
  flame.position.y = 3.1
  flame.visible = false
  group.add(flame)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 20), glow(accent))
  halo.rotation.x = Math.PI / 2
  halo.position.y = 1.6
  halo.visible = false
  group.add(halo)

  let active = false
  let time = 0

  return {
    mesh: group,
    get active() {
      return active
    },
    activate() {
      if (active) return
      active = true
      flame.visible = true
      halo.visible = true
    },
    update(dt) {
      if (!active) return
      time += dt
      flame.rotation.y += dt * 1.4
      flame.scale.setScalar(1 + Math.sin(time * 4) * 0.12)
      halo.position.y = 1.6 + Math.sin(time * 1.6) * 0.28
      halo.rotation.z += dt * 0.7
    },
  }
}

/**
 * Пучки травы на InstancedMesh.
 *
 * Трава — самый массовый объект в кадре, и каждая её травинка отдельным мешем
 * съела бы весь бюджет вызовов отрисовки. Один инстансированный меш на
 * платформу решает это полностью.
 */
export function buildGrassPatch(count, radius, rng, palette) {
  // Травинка — два перекрещенных треугольника: с любого ракурса видна плоскость.
  const blade = new THREE.BufferGeometry()
  const w = 0.075
  const h = 0.2
  const vertices = new Float32Array([
    -w, 0, 0, w, 0, 0, 0, h, 0,
    0, 0, -w, 0, 0, w, 0, h, 0,
  ])
  blade.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  blade.computeVertexNormals()

  // Трава светлее подложки, а не темнее. Тёмные травинки на зелёной шапке
  // читаются как разбросанный мусор; светлые сливаются в ворс.
  const tint = palette.foliage.clone()
  tint.offsetHSL(0.01, 0.05, 0.1)
  const mesh = new THREE.InstancedMesh(blade, toon(quantize(tint), { side: THREE.DoubleSide }), count)
  mesh.castShadow = false
  mesh.receiveShadow = false

  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    // Корень из случайного числа даёт равномерную плотность по площади круга:
    // без него трава сбивается в центр платформы.
    const angle = rng.next() * TAU
    const dist = Math.sqrt(rng.next()) * radius
    dummy.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
    dummy.rotation.set(rng.spread(0.12), rng.next() * TAU, rng.spread(0.12))
    dummy.scale.setScalar(rng.range(0.7, 1.4))
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
