import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Мелкие обёртки над three.js, чтобы модели читались как список деталей,
 * а не как стена вызовов конструкторов. Материалы и геометрии кэшируются.
 */

const materials = new Map()

/** Матовый материал (Lambert — дешёвый и отлично смотрится в мультяшной сцене). */
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`
  let m = materials.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...opts })
    materials.set(key, m)
  }
  return m
}

/** Полупрозрачный материал — вода, крылья, аура. */
export function glass(color, opacity = 0.5, opts = {}) {
  return mat(color, { transparent: true, opacity, depthWrite: false, ...opts })
}

const geometries = new Map()

function cached(key, build) {
  let g = geometries.get(key)
  if (!g) {
    g = build()
    geometries.set(key, g)
  }
  return g
}

export const geo = {
  box: (w, h, d) => cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  sphere: (r, ws = 16, hs = 12) => cached(`sph${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cyl: (rt, rb, h, seg = 12) => cached(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  /** Труба без крышек — нужна там, где внутрь можно заглянуть (сруб колодца). */
  pipe: (rt, rb, h, seg = 16) => cached(`pip${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true)),
  cone: (r, h, seg = 12) => cached(`con${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  capsule: (r, len, seg = 10) => cached(`cap${r},${len},${seg}`, () => new THREE.CapsuleGeometry(r, len, 6, seg)),
  torus: (r, t, seg = 16, rings = 10) => cached(`tor${r},${t},${seg},${rings}`, () => new THREE.TorusGeometry(r, t, rings, seg)),
  icosa: (r, det = 0) => cached(`ico${r},${det}`, () => new THREE.IcosahedronGeometry(r, det)),
  octa: (r, det = 0) => cached(`oct${r},${det}`, () => new THREE.OctahedronGeometry(r, det)),
  circle: (r, seg = 24) => cached(`cir${r},${seg}`, () => new THREE.CircleGeometry(r, seg)),
  plane: (w, h) => cached(`pln${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
  ring: (ri, ro, seg = 28) => cached(`rng${ri},${ro},${seg}`, () => new THREE.RingGeometry(ri, ro, seg)),
}

/**
 * Создаёт меш с трансформацией одной строкой.
 * `s` — масштаб (число или [x,y,z]), `r` — поворот в радианах.
 */
export function part(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, shadow = true, cast = true } = {}) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2])
  else m.scale.setScalar(s)
  m.castShadow = shadow && cast
  m.receiveShadow = shadow
  return m
}

/** Группа с уже добавленными детьми. */
export function group(...children) {
  const g = new THREE.Group()
  for (const c of children) if (c) g.add(c)
  return g
}

/** Пара симметричных деталей (левая и правая). */
export function mirrored(build, dx) {
  const g = new THREE.Group()
  const left = build(-1)
  const right = build(1)
  left.position.x -= dx
  right.position.x += dx
  g.add(left, right)
  return { group: g, left, right }
}

/** Простые глаза-бусинки: тёмная сфера + блик. */
export function eyes(color = 0x2a1b2a, radius = 0.055, spread = 0.09, forward = 0.16, height = 0) {
  const g = new THREE.Group()
  for (const side of [-1, 1]) {
    const eye = part(geo.sphere(radius, 10, 8), mat(color), { x: side * spread, y: height, z: forward, shadow: false })
    const glint = part(geo.sphere(radius * 0.4, 6, 6), mat(0xffffff, { emissive: 0x666666 }), {
      x: side * spread + side * radius * 0.25,
      y: height + radius * 0.3,
      z: forward + radius * 0.7,
      shadow: false,
    })
    g.add(eye, glint)
  }
  return g
}

/** Невидимая сфера-«кнопка»: по ней удобно попадать курсором. */
export function hitSphere(radius, y = 0.6) {
  const m = new THREE.Mesh(geo.sphere(radius, 8, 6), new THREE.MeshBasicMaterial({ visible: false }))
  m.position.y = y
  m.userData.isHit = true
  return m
}

/**
 * Склеивает неподвижную группу в один меш на материал.
 *
 * Деревья, цветы, камни и забор никогда не двигаются, но дают сотни вызовов
 * отрисовки. После склейки их остаётся десяток, и сцена летает даже на слабой
 * видеокарте. Анимированные части через это прогонять нельзя — они потеряют
 * собственные трансформации.
 */
export function mergeStatic(root, { castShadow = true } = {}) {
  root.updateMatrixWorld(true)

  const byMaterial = new Map()
  root.traverse((object) => {
    if (!object.isMesh || object.material.visible === false) return
    const geometry = object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)
    // Лишние атрибуты мешают склейке — оставляем только необходимое.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
    }
    if (!byMaterial.has(object.material)) byMaterial.set(object.material, [])
    byMaterial.get(object.material).push(geometry)
  })

  const merged = new THREE.Group()
  for (const [material, list] of byMaterial) {
    const geometry = mergeGeometries(list, false)
    list.forEach((g) => g.dispose())
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    merged.add(mesh)
  }
  return merged
}

/** Тёплый оттенок цвета (для подсветки родственных деталей). */
export function tint(color, amount) {
  const c = new THREE.Color(color)
  if (amount > 0) c.lerp(new THREE.Color(0xffffff), amount)
  else c.lerp(new THREE.Color(0x000000), -amount)
  return c.getHex()
}
