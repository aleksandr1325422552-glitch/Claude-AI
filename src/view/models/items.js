import * as THREE from 'three'
import { geo, glass, group, mat, part, tint } from './common.js'
import { ITEMS } from '../../data/items.js'

/**
 * 3D-модели товаров, лежащих на земле. Собираются из примитивов, чтобы не
 * зависеть от шрифтов и картинок: эмодзи используются только в HTML-интерфейсе.
 */

const BUILDERS = {
  star: (c, a) =>
    group(
      part(geo.octa(0.19, 0), mat(c, { emissive: tint(c, -0.55), flatShading: true }), { s: [1, 1.35, 1] }),
      part(geo.octa(0.11, 0), mat(a, { emissive: tint(a, -0.4) }), { rz: Math.PI / 4, s: [1.6, 0.5, 1.6] }),
    ),

  pearl: (c, a) =>
    group(
      part(geo.sphere(0.17, 16, 12), mat(c, { emissive: 0x223344 })),
      part(geo.sphere(0.24, 16, 10), mat(a), { y: -0.11, s: [1, 0.32, 1] }),
      part(geo.sphere(0.24, 16, 10), mat(tint(a, -0.2)), { y: -0.17, s: [1, 0.28, 1] }),
    ),

  vial: (c, a) =>
    group(
      part(geo.cyl(0.11, 0.12, 0.26, 12), glass(a, 0.45, { depthWrite: true })),
      part(geo.cyl(0.1, 0.11, 0.15, 12), mat(c, { emissive: tint(c, -0.5) }), { y: -0.05 }),
      part(geo.cyl(0.05, 0.05, 0.09, 8), mat(0xd8b06a), { y: 0.17 }),
    ),

  blob: (c, a) =>
    group(
      part(geo.sphere(0.2, 14, 10), glass(c, 0.85, { depthWrite: true }), { s: [1, 0.75, 1] }),
      part(geo.sphere(0.09, 10, 8), mat(a, { emissive: 0x224411 }), { y: -0.02 }),
      part(geo.sphere(0.05, 8, 6), mat(0xffffff, { emissive: 0x557755 }), { x: -0.07, y: 0.1, z: 0.06, s: [1, 0.5, 0.7] }),
    ),

  scale: (c, a) =>
    group(
      part(geo.cyl(0.03, 0.2, 0.06, 6), mat(c, { flatShading: true }), { rx: -0.35, s: [1, 1, 1.25] }),
      part(geo.cyl(0.02, 0.13, 0.05, 6), mat(a), { y: 0.05, rx: -0.35, s: [1, 1, 1.25] }),
    ),

  feather: (c, a) =>
    group(
      part(geo.capsule(0.075, 0.26, 10), mat(c), { rz: 0.35, s: [1, 1, 0.28] }),
      part(geo.capsule(0.045, 0.2, 8), mat(a), { x: 0.03, y: 0.06, rz: 0.35, s: [1, 1, 0.3] }),
      part(geo.cyl(0.012, 0.016, 0.36, 6), mat(0xd9d2c4), { rz: 0.35 }),
    ),

  flask: (c, a) =>
    group(
      part(geo.sphere(0.17, 16, 12), glass(a, 0.4, { depthWrite: true })),
      part(geo.sphere(0.14, 14, 10), mat(c, { emissive: tint(c, -0.45) }), { y: -0.02 }),
      part(geo.cyl(0.055, 0.055, 0.16, 10), glass(a, 0.4, { depthWrite: true }), { y: 0.2 }),
      part(geo.cyl(0.045, 0.055, 0.07, 8), mat(0xc98f4e), { y: 0.3 }),
    ),

  amulet: (c, a) =>
    group(
      part(geo.torus(0.16, 0.028, 18), mat(c, { emissive: tint(c, -0.6) }), { rx: 0.35 }),
      part(geo.octa(0.11, 0), mat(a, { emissive: tint(a, -0.4), flatShading: true }), { y: -0.05, z: 0.03 }),
      part(geo.torus(0.05, 0.014, 10), mat(c), { y: 0.17, rx: 0.35 }),
    ),

  charm: (c, a) =>
    group(
      part(geo.cyl(0.022, 0.03, 0.4, 8), mat(0x8a5f36), { rz: 0.3 }),
      part(geo.octa(0.13, 0), mat(c, { emissive: tint(c, -0.35), flatShading: true }), { x: 0.06, y: 0.22, s: [1, 1.3, 1] }),
      part(geo.torus(0.07, 0.016, 12), mat(a, { emissive: tint(a, -0.5) }), { x: 0.06, y: 0.22, rx: Math.PI / 2 }),
    ),

  gem: (c, a) =>
    group(
      part(geo.icosa(0.2, 0), mat(c, { emissive: tint(c, -0.4), flatShading: true }), { s: [1, 1.25, 1] }),
      part(geo.icosa(0.1, 0), mat(a, { emissive: 0x669999, flatShading: true }), { y: 0.02 }),
      part(geo.torus(0.19, 0.02, 18), mat(0xfff0b8, { emissive: 0x554400 }), { rx: Math.PI / 2 }),
    ),
}

/** Модель предмета. Кольцо-подсказку рисует FarmView — оно живёт на земле. */
export function buildItemModel(itemId) {
  const def = ITEMS[itemId]
  const build = BUILDERS[def.shape] ?? BUILDERS.blob
  const root = new THREE.Group()
  const body = build(def.color, def.accent)
  root.add(body)
  return { root, body }
}

/**
 * Мерцающее кольцо под лежащим товаром: сразу видно, что его можно подобрать.
 * Материал у каждого кольца свой — прозрачность мигает независимо.
 */
export function buildItemRing(itemId) {
  const def = ITEMS[itemId]
  const ring = part(geo.ring(0.4, 0.56, 24), glass(def.color, 0.55, { side: THREE.DoubleSide }), {
    rx: -Math.PI / 2,
    shadow: false,
  })
  ring.material = ring.material.clone()
  return ring
}

/** Иконка предмета для витрин и фургона — та же модель, но мельче. */
export function buildItemIcon(itemId, scale = 1) {
  const { root } = buildItemModel(itemId)
  root.scale.setScalar(scale)
  return root
}
