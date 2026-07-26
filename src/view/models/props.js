import * as THREE from 'three'
import { geo, glass, group, mat, mergeStatic, part, tint } from './common.js'
import { buildItemIcon } from './items.js'

/** Постройки и декорации фермы. Все стоят основанием на y = 0. */

const WOOD = 0x8a5a30
const WOOD_DARK = 0x5f3b1e
const STONE = 0x9aa0a6
const STONE_DARK = 0x6f757b
const STRAW = 0xe0be6a

// ---------------------------------------------------------------- колодец ---

export function buildWell() {
  const root = new THREE.Group()

  // Каменный сруб. Стенка — труба без крышки, иначе воду не видно сверху.
  const stones = group(
    part(geo.pipe(0.92, 1.0, 0.7, 18), mat(STONE, { side: THREE.DoubleSide }), { y: 0.35 }),
    part(geo.torus(0.92, 0.09, 20), mat(STONE_DARK), { y: 0.7, rx: Math.PI / 2 }),
  )
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    stones.add(
      part(geo.box(0.3, 0.2, 0.16), mat(tint(STONE, i % 2 ? 0.08 : -0.08)), {
        x: Math.cos(a) * 0.93,
        y: 0.2 + (i % 3) * 0.16,
        z: Math.sin(a) * 0.93,
        ry: -a,
      }),
    )
  }
  root.add(mergeStatic(stones))

  // Вода — уровень меняется вместе с запасом
  const water = part(geo.circle(0.82, 20), mat(0x2a86bd, { emissive: 0x0b3c5c, side: THREE.DoubleSide }), {
    y: 0.5,
    rx: -Math.PI / 2,
    shadow: false,
  })
  root.add(water)
  // Тёмное дно — чтобы пустой колодец выглядел пустым, а не дырой в мире
  root.add(part(geo.circle(0.95, 20), mat(0x1a2a33), { y: 0.06, rx: -Math.PI / 2, shadow: false }))

  // Стойки и крыша
  for (const side of [-1, 1]) root.add(part(geo.box(0.14, 1.5, 0.14), mat(WOOD_DARK), { x: side * 0.78, y: 1.4 }))
  root.add(part(geo.box(0.16, 0.16, 0.16), mat(WOOD_DARK), { y: 2.14 }))
  for (const side of [-1, 1]) {
    root.add(part(geo.box(1.35, 0.1, 1.5), mat(0xb4553c), { x: side * 0.45, y: 2.32, rz: side * -0.62 }))
  }

  // Ворот и ведро
  root.add(part(geo.cyl(0.09, 0.09, 1.5, 10), mat(WOOD), { y: 1.75, rz: Math.PI / 2 }))
  const bucket = group(
    part(geo.cyl(0.17, 0.14, 0.26, 10), mat(WOOD), {}),
    part(geo.torus(0.17, 0.02, 12), mat(0x7a7f85), { y: 0.12, rx: Math.PI / 2 }),
  )
  bucket.position.set(0, 1.3, 0.1)
  root.add(bucket)
  root.add(part(geo.cyl(0.012, 0.012, 0.4, 6), mat(0x4a4a4a), { y: 1.56, z: 0.1 }))

  return { root, water, bucket }
}

// ------------------------------------------------------------------ склад ---

export function buildWarehouse() {
  const root = new THREE.Group()
  root.add(part(geo.box(3.4, 1.9, 2.6), mat(0xefdcb4), { y: 0.95 }))
  root.add(part(geo.box(3.6, 0.16, 2.8), mat(WOOD_DARK), { y: 1.9 }))

  // Двускатная крыша
  for (const side of [-1, 1]) {
    root.add(part(geo.box(1.95, 0.16, 2.9), mat(0xc0472f), { x: side * 0.85, y: 2.35, rz: side * -0.52 }))
  }
  root.add(part(geo.box(0.2, 0.2, 2.95), mat(0x8f3422), { y: 2.72 }))

  // Ворота и петли
  const door = part(geo.box(1.25, 1.4, 0.12), mat(WOOD), { y: 0.7, z: 1.32 })
  root.add(door)
  root.add(part(geo.box(1.3, 0.1, 0.16), mat(WOOD_DARK), { y: 1.15, z: 1.36 }))
  root.add(part(geo.box(0.1, 1.45, 0.16), mat(WOOD_DARK), { y: 0.72, z: 1.36 }))

  // Ящики у входа
  root.add(part(geo.box(0.5, 0.5, 0.5), mat(tint(WOOD, 0.12)), { x: -1.5, y: 0.25, z: 1.5, ry: 0.3 }))
  root.add(part(geo.box(0.42, 0.42, 0.42), mat(tint(WOOD, 0.02)), { x: 1.55, y: 0.21, z: 1.45, ry: -0.4 }))
  root.add(part(geo.box(0.4, 0.4, 0.4), mat(tint(WOOD, 0.18)), { x: 1.5, y: 0.6, z: 1.5, ry: 0.2 }))

  // Табличка с нарисованным ящиком
  const sign = group(
    part(geo.box(0.1, 0.9, 0.1), mat(WOOD_DARK), { y: 0.45 }),
    part(geo.box(0.8, 0.55, 0.07), mat(STRAW), { y: 1.05 }),
    part(geo.box(0.34, 0.34, 0.06), mat(tint(WOOD, 0.1)), { y: 1.05, z: 0.09 }),
    part(geo.box(0.4, 0.06, 0.07), mat(WOOD_DARK), { y: 1.05, z: 0.11 }),
  )
  sign.position.set(-1.9, 0, 0.9)
  sign.rotation.y = 0.5
  root.add(sign)

  return { root, door }
}

// --------------------------------------------------------------- питомник ---

export function buildNursery() {
  const root = new THREE.Group()

  // Каменная площадка с гнездом
  root.add(part(geo.cyl(1.5, 1.6, 0.3, 18), mat(STONE), { y: 0.15 }))
  root.add(part(geo.torus(1.15, 0.26, 20, 10), mat(STRAW), { y: 0.34, rx: Math.PI / 2 }))
  root.add(part(geo.circle(1.1, 18), mat(tint(STRAW, -0.25)), { y: 0.32, rx: -Math.PI / 2, shadow: false }))

  // Навес на четырёх столбах: держим его высоко и узко, иначе крыша с высоты
  // камеры полностью закрывает гнездо с яйцами.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(part(geo.box(0.12, 2.4, 0.12), mat(WOOD_DARK), { x: sx * 1.3, y: 1.2, z: sz * 1.3 }))
    }
  }
  root.add(part(geo.cone(1.95, 1.15, 4), mat(0x7c5bb5), { y: 2.98, ry: Math.PI / 4 }))
  root.add(part(geo.torus(0.34, 0.05, 12), mat(0x9d7ede), { y: 2.44, rx: Math.PI / 2 }))
  root.add(part(geo.sphere(0.14, 10, 8), mat(0xffc63f, { emissive: 0x554400 }), { y: 3.66 }))

  // Три места под яйца, сдвинутые к камере
  const eggSlots = []
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Group()
    slot.position.set((i - 1) * 0.56, 0.42, 0.42)
    slot.visible = false
    root.add(slot)
    eggSlots.push(slot)
  }

  return { root, eggSlots }
}

/** Яйцо в гнезде. `hybrid` — с фиолетовыми прожилками. */
export function buildEgg(hybrid = false) {
  const g = group(
    part(geo.sphere(0.26, 14, 12), mat(hybrid ? 0xe8d6ff : 0xfdf1d8), { s: [1, 1.28, 1] }),
    part(geo.torus(0.2, 0.03, 14), mat(hybrid ? 0x8b5cf6 : 0xd8b06a), { y: 0.02, rx: Math.PI / 2 - 0.3 }),
  )
  if (hybrid) g.add(part(geo.sphere(0.08, 8, 6), mat(0xc9a3ff, { emissive: 0x442277 }), { y: 0.3 }))
  return g
}

// ---------------------------------------------------------------- клетка ---

export function buildCage() {
  const root = new THREE.Group()
  root.add(part(geo.box(2.1, 0.16, 2.1), mat(WOOD_DARK), { y: 0.08 }))
  root.add(part(geo.box(2.2, 0.14, 2.2), mat(0x6f5535), { y: 1.72 }))

  // Двадцать четыре прута — в один меш
  const bars = new THREE.Group()
  for (let i = 0; i < 6; i++) {
    const t = -0.9 + (i / 5) * 1.8
    for (const side of [-1, 1]) {
      bars.add(part(geo.cyl(0.045, 0.045, 1.66, 6), mat(0x8b929a), { x: t, y: 0.88, z: side * 0.95 }))
      bars.add(part(geo.cyl(0.045, 0.045, 1.66, 6), mat(0x8b929a), { x: side * 0.95, y: 0.88, z: t }))
    }
  }
  root.add(mergeStatic(bars))
  root.add(part(geo.cone(1.6, 0.6, 4), mat(0x5a4a63), { y: 2.05, ry: Math.PI / 4 }))
  root.add(part(geo.torus(0.16, 0.03, 12), mat(0xffc63f), { y: 0.9, z: 0.98, rx: Math.PI / 2 }))

  // Метки занятых мест
  const slots = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const blob = group(
      part(geo.icosa(0.24, 0), mat(0x3b2a52, { flatShading: true }), { s: [1, 0.8, 1] }),
      part(geo.sphere(0.05, 8, 6), mat(0xff4d3d, { emissive: 0x882211 }), { x: -0.08, y: 0.06, z: 0.18 }),
      part(geo.sphere(0.05, 8, 6), mat(0xff4d3d, { emissive: 0x882211 }), { x: 0.08, y: 0.06, z: 0.18 }),
    )
    blob.position.set(Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5)
    blob.rotation.y = -a
    blob.visible = false
    root.add(blob)
    slots.push(blob)
  }

  return { root, slots }
}

// ------------------------------------------------------------- мастерская ---

export function buildFactory(def) {
  const root = new THREE.Group()
  root.add(part(geo.box(2.6, 1.7, 2.1), mat(def.wall), { y: 0.85 }))
  root.add(part(geo.box(2.75, 0.14, 2.25), mat(WOOD_DARK), { y: 1.7 }))
  for (const side of [-1, 1]) {
    root.add(part(geo.box(1.55, 0.14, 2.35), mat(def.roof), { x: side * 0.66, y: 2.08, rz: side * -0.55 }))
  }
  root.add(part(geo.box(0.18, 0.18, 2.4), mat(tint(def.roof, -0.25)), { y: 2.4 }))

  // Дверь и окно
  root.add(part(geo.box(0.9, 1.15, 0.1), mat(WOOD), { y: 0.58, z: 1.07 }))
  root.add(part(geo.box(0.45, 0.45, 0.08), glass(0xbfe8ff, 0.8, { depthWrite: true }), { x: 0.85, y: 1.15, z: 1.06 }))

  // Труба
  root.add(part(geo.box(0.34, 0.9, 0.34), mat(0xa8564a), { x: -0.8, y: 2.5 }))
  const smoke = []
  for (let i = 0; i < 4; i++) {
    const puff = part(geo.sphere(0.2, 10, 8), glass(0xffffff, 0.4), { x: -0.8, y: 3.0 + i * 0.45, shadow: false })
    puff.visible = false
    root.add(puff)
    smoke.push(puff)
  }

  // Шестерня — вращается, пока мастерская работает
  const gearParts = group(part(geo.torus(0.3, 0.09, 14, 8), mat(tint(def.roof, -0.15)), {}))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    gearParts.add(part(geo.box(0.12, 0.12, 0.11), mat(tint(def.roof, -0.3)), { x: Math.cos(a) * 0.37, y: Math.sin(a) * 0.37, rz: a }))
  }
  const gear = mergeStatic(gearParts)
  gear.position.set(-0.85, 1.15, 1.1)
  root.add(gear)

  // Вывеска с изделием
  const sign = group(
    part(geo.box(0.1, 1.1, 0.1), mat(WOOD_DARK), { y: 0.55 }),
    part(geo.box(0.86, 0.62, 0.08), mat(STRAW), { y: 1.2 }),
  )
  const icon = buildItemIcon(def.output, 0.95)
  icon.position.set(0, 1.2, 0.16)
  sign.add(icon)
  sign.position.set(1.6, 0, 1.0)
  sign.rotation.y = -0.45
  root.add(sign)

  // Полоска прогресса над крышей
  const barBack = part(geo.box(1.5, 0.12, 0.08), mat(0x2b2b33), { y: 2.95, shadow: false })
  const bar = part(geo.box(1.5, 0.12, 0.1), mat(0x4fbf8b, { emissive: 0x1a5c40 }), { y: 2.95, z: 0.02, shadow: false })
  bar.userData.width = 1.5
  root.add(barBack, bar)
  barBack.visible = false
  bar.visible = false

  return { root, gear, smoke, bar, barBack, icon }
}

// ---------------------------------------------------------------- фургон ---

export function buildTruck() {
  const root = new THREE.Group()
  const chassis = new THREE.Group()

  chassis.add(part(geo.box(2.4, 0.24, 1.35), mat(WOOD), { y: 0.55 }))
  chassis.add(part(geo.box(2.45, 0.55, 0.12), mat(tint(WOOD, -0.15)), { y: 0.85, z: 0.67 }))
  chassis.add(part(geo.box(2.45, 0.55, 0.12), mat(tint(WOOD, -0.15)), { y: 0.85, z: -0.67 }))
  chassis.add(part(geo.box(0.12, 0.55, 1.35), mat(tint(WOOD, -0.25)), { x: -1.2, y: 0.85 }))

  // Дуги тента
  for (let i = 0; i < 3; i++) {
    chassis.add(part(geo.torus(0.62, 0.05, 12, 6), mat(0xd9cdb4), { x: -0.5 + i * 0.62, y: 1.1, ry: Math.PI / 2 }))
  }
  chassis.add(part(geo.box(1.85, 0.1, 1.2), glass(0xf3e8d0, 0.9, { depthWrite: true }), { x: 0.12, y: 1.7 }))

  // Козлы
  chassis.add(part(geo.box(0.6, 0.4, 1.1), mat(tint(WOOD, 0.1)), { x: 1.35, y: 0.9 }))
  chassis.add(part(geo.box(0.12, 0.45, 1.1), mat(tint(WOOD, -0.1)), { x: 1.1, y: 1.15 }))

  const wheels = []
  for (const sx of [-0.85, 0.95]) {
    for (const sz of [-1, 1]) {
      const r = sx > 0 ? 0.34 : 0.42
      const parts = group(
        part(geo.cyl(r, r, 0.14, 14), mat(0x4c3620), { rx: Math.PI / 2 }),
        part(geo.torus(r, 0.05, 14, 6), mat(0x2f2114), {}),
      )
      for (let i = 0; i < 4; i++) {
        parts.add(part(geo.box(0.06, r * 1.85, 0.06), mat(0x6b4c2c), { rz: (i / 4) * Math.PI }))
      }
      const wheel = mergeStatic(parts)
      wheel.position.set(sx, r, sz * 0.72)
      chassis.add(wheel)
      wheels.push(wheel)
    }
  }

  // Место, куда складывается груз
  const cargo = new THREE.Group()
  cargo.position.set(-0.1, 0.8, 0)
  chassis.add(cargo)

  root.add(chassis)
  return { root, chassis, wheels, cargo }
}

// ------------------------------------------------------------- декорации ---

export function buildTree(seed = 0) {
  const h = 1.6 + (seed % 3) * 0.35
  const g = group(part(geo.cyl(0.16, 0.24, h, 8), mat(0x7a5636), { y: h / 2 }))
  const green = [0x3f8f4f, 0x4fa85c, 0x357a44][seed % 3]
  g.add(part(geo.sphere(0.95, 12, 10), mat(green), { y: h + 0.35, s: [1, 0.9, 1] }))
  g.add(part(geo.sphere(0.62, 12, 10), mat(tint(green, 0.12)), { x: 0.5, y: h + 0.05, z: 0.25 }))
  g.add(part(geo.sphere(0.55, 12, 10), mat(tint(green, -0.1)), { x: -0.45, y: h + 0.15, z: -0.25 }))
  return g
}

export function buildPine(seed = 0) {
  const g = group(part(geo.cyl(0.14, 0.2, 0.9, 8), mat(0x6b4a2c), { y: 0.45 }))
  const green = [0x2f6b45, 0x27573a][seed % 2]
  for (let i = 0; i < 3; i++) {
    g.add(part(geo.cone(0.85 - i * 0.2, 0.95, 10), mat(tint(green, i * 0.06)), { y: 1.05 + i * 0.62 }))
  }
  return g
}

export function buildRock(seed = 0) {
  const s = 0.35 + (seed % 4) * 0.14
  return group(
    part(geo.icosa(s, 0), mat(seed % 2 ? STONE : STONE_DARK, { flatShading: true }), { y: s * 0.7, s: [1, 0.75, 1.1], ry: seed }),
    part(geo.icosa(s * 0.5, 0), mat(tint(STONE, -0.12), { flatShading: true }), { x: s, y: s * 0.35, ry: seed * 2 }),
  )
}

export function buildBush(seed = 0) {
  const c = [0x4a9e58, 0x3f8b4c][seed % 2]
  return group(
    part(geo.sphere(0.42, 10, 8), mat(c), { y: 0.34, s: [1.2, 0.85, 1] }),
    part(geo.sphere(0.3, 10, 8), mat(tint(c, 0.1)), { x: 0.34, y: 0.26 }),
    part(geo.sphere(0.09, 8, 6), mat(0xff5f7a), { x: -0.2, y: 0.55, z: 0.2 }),
  )
}

export function buildFlower(seed = 0) {
  const colors = [0xff7fa8, 0xffd85e, 0xa78bfa, 0xfff1f5, 0xff9d5c]
  const c = colors[seed % colors.length]
  const g = group(part(geo.cyl(0.02, 0.025, 0.3, 5), mat(0x4a9e58), { y: 0.15, shadow: false }))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.add(part(geo.sphere(0.075, 8, 6), mat(c), { x: Math.cos(a) * 0.085, y: 0.32, z: Math.sin(a) * 0.085, s: [1, 0.6, 1], shadow: false }))
  }
  g.add(part(geo.sphere(0.055, 8, 6), mat(0xffe066), { y: 0.35, shadow: false }))
  return g
}

export function buildPond() {
  return group(
    part(geo.circle(3.0, 28), mat(0x2f8fc0, { emissive: 0x0a3550 }), { y: 0.02, rx: -Math.PI / 2, shadow: false }),
    part(geo.torus(3.0, 0.22, 28, 8), mat(0xc7b18a), { y: 0.04, rx: Math.PI / 2 }),
    part(geo.circle(1.6, 20), glass(0x8fdcff, 0.35), { y: 0.05, rx: -Math.PI / 2, shadow: false }),
    part(geo.sphere(0.3, 10, 8), mat(0x4a9e58), { x: 1.4, y: 0.1, z: 1.1, s: [1.6, 0.3, 1.6], shadow: false }),
    part(geo.sphere(0.22, 10, 8), mat(0x3f8b4c), { x: -1.5, y: 0.1, z: -0.9, s: [1.6, 0.3, 1.6], shadow: false }),
  )
}

/** Один пролёт забора: столб плюс две жерди вправо. */
export function buildFenceSection(withRails = true) {
  const g = group(part(geo.box(0.14, 0.95, 0.14), mat(WOOD_DARK), { y: 0.48 }))
  g.add(part(geo.cone(0.12, 0.16, 4), mat(tint(WOOD_DARK, 0.15)), { y: 1.02 }))
  if (withRails) {
    g.add(part(geo.box(1.75, 0.11, 0.08), mat(WOOD), { x: 0.87, y: 0.72 }))
    g.add(part(geo.box(1.75, 0.11, 0.08), mat(WOOD), { x: 0.87, y: 0.4 }))
  }
  return g
}

export function buildCloud(seed = 0) {
  const m = glass(0xffffff, 0.82)
  const puffs = group(
    part(geo.sphere(1.1, 12, 10), m, { s: [1.3, 0.75, 1], shadow: false }),
    part(geo.sphere(0.8, 12, 10), m, { x: 1.2, y: -0.1, s: [1.2, 0.7, 1], shadow: false }),
    part(geo.sphere(0.7, 12, 10), m, { x: -1.15, y: -0.15, s: [1.2, 0.7, 1], shadow: false }),
    part(geo.sphere(0.6, 12, 10), m, { x: 0.35, y: 0.45, s: [1.2, 0.8, 1], shadow: false }),
  )
  const g = mergeStatic(puffs, { castShadow: false })
  g.scale.setScalar(0.9 + (seed % 3) * 0.35)
  return g
}

/** Указатель «на рынок» у выезда с фермы. */
export function buildSignpost() {
  const g = group(part(geo.box(0.14, 1.9, 0.14), mat(WOOD_DARK), { y: 0.95 }))
  const board = part(geo.box(1.5, 0.5, 0.09), mat(STRAW), { y: 1.6, z: 0.05 })
  g.add(board)
  g.add(part(geo.cone(0.28, 0.5, 3), mat(tint(STRAW, -0.2)), { x: 0.95, y: 1.6, rz: -Math.PI / 2, s: [1, 1, 0.18] }))
  const coin = part(geo.cyl(0.19, 0.19, 0.05, 14), mat(0xffc63f, { emissive: 0x553f00 }), { y: 1.6, z: 0.12, rx: Math.PI / 2 })
  g.add(coin)
  return g
}
