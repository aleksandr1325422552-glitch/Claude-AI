import * as THREE from 'three'
import { eyes, geo, glass, group, mat, part, tint } from './common.js'

/**
 * Модели монстров: слизень, дракончик, грифон, а также тёмная тварь-вредитель.
 * Структура `parts` совпадает с моделями девушек — аниматор общий.
 */

/** Перепончатое крыло: сплющенный конус с «пальцами». */
export function makeBatWing(color, size = 1) {
  const w = group()
  const membrane = part(geo.cone(0.3 * size, 0.62 * size, 3), mat(color), {
    rz: Math.PI / 2,
    s: [1, 1, 0.12],
  })
  w.add(membrane)
  for (let i = -1; i <= 1; i++) {
    w.add(part(geo.cyl(0.012, 0.02, 0.55 * size, 6), mat(tint(color, -0.3)), { x: 0.28 * size, y: i * 0.1 * size, rz: Math.PI / 2 + i * 0.24 }))
  }
  return w
}

/** Пернатое крыло: три слоя вытянутых «перьев». */
export function makeFeatherWing(color, accent, size = 1) {
  const w = group()
  for (let i = 0; i < 3; i++) {
    const len = (0.5 - i * 0.08) * size
    w.add(
      part(geo.capsule(0.07 * size, len, 8), i === 0 ? mat(accent) : mat(color), {
        x: (0.16 + i * 0.13) * size,
        y: -i * 0.05 * size,
        rz: Math.PI / 2 - 0.25 + i * 0.16,
        s: [1, 1, 0.35],
      }),
    )
  }
  return w
}

// ===========================================================================

export function buildSlime(p) {
  const root = new THREE.Group()
  const body = group()

  const blob = part(geo.sphere(0.4, 18, 14), glass(p.body, 0.88, { depthWrite: true }), { y: 0.3, s: [1, 0.78, 1] })
  body.add(blob)
  body.add(part(geo.sphere(0.24, 14, 10), mat(p.belly, { emissive: 0x224411 }), { y: 0.22, s: [1, 0.7, 1] }))
  // Блик-«капля» сверху
  body.add(part(geo.sphere(0.09, 10, 8), mat(0xffffff, { emissive: 0x557744 }), { x: -0.12, y: 0.52, z: 0.1, s: [1, 0.5, 0.7], shadow: false }))

  const head = group()
  head.add(eyes(p.eye, 0.075, 0.13, 0.3, 0.0))
  // Рожки-антенны
  for (const side of [-1, 1]) {
    head.add(part(geo.cone(0.035, 0.16, 6), mat(p.horn), { x: side * 0.12, y: 0.33, rz: side * 0.35 }))
  }
  head.position.y = 0.28
  body.add(head)

  // Ротик
  body.add(part(geo.torus(0.06, 0.016, 10, 8), mat(0x2c4a1c), { y: 0.14, z: 0.36, rx: 0.4, shadow: false }))

  root.add(body)
  return { root, parts: { body, head, blob, anchors: { head, back: body, hip: body } }, height: 0.8, hopper: true }
}

export function buildDragonling(p) {
  const root = new THREE.Group()
  const body = group()

  body.add(part(geo.capsule(0.22, 0.3, 12), mat(p.body), { y: 0.44, rx: Math.PI / 2, s: [1, 1, 0.95] }))
  body.add(part(geo.capsule(0.16, 0.24, 10), mat(p.belly), { y: 0.36, z: 0.06, rx: Math.PI / 2, s: [1, 1, 0.7] }))

  // Лапы
  const legs = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = part(geo.capsule(0.055, 0.16, 8), mat(tint(p.body, -0.15)), { x: sx * 0.16, y: 0.16, z: sz * 0.17 })
      legs.push(leg)
      body.add(leg)
    }
  }

  const head = group()
  head.add(part(geo.sphere(0.2, 14, 12), mat(p.body), { s: [1, 0.95, 1.05] }))
  head.add(part(geo.cone(0.13, 0.26, 10), mat(tint(p.body, 0.08)), { y: -0.02, z: 0.22, rx: Math.PI / 2 }))
  head.add(part(geo.sphere(0.05, 8, 6), mat(p.belly), { y: 0.02, z: 0.33, s: [1.3, 0.7, 0.7] }))
  for (const side of [-1, 1]) {
    head.add(part(geo.cone(0.05, 0.2, 6), mat(p.horn), { x: side * 0.11, y: 0.19, z: -0.03, rz: side * 0.4, rx: -0.2 }))
  }
  head.add(eyes(p.eye, 0.045, 0.1, 0.16, 0.05))
  head.position.set(0, 0.62, 0.28)
  body.add(head)

  // Гребень
  for (let i = 0; i < 3; i++) {
    body.add(part(geo.cone(0.05, 0.12, 4), mat(p.horn), { y: 0.63 - i * 0.02, z: 0.02 - i * 0.16, rx: -0.2 }))
  }

  const tail = group()
  tail.add(part(geo.cone(0.11, 0.5, 8), mat(p.body), { y: 0, z: -0.24, rx: -Math.PI / 2 }))
  tail.add(part(geo.cone(0.09, 0.16, 5), mat(p.horn), { z: -0.5, rx: -Math.PI / 2, s: [1, 1, 0.4] }))
  tail.position.set(0, 0.42, -0.28)
  body.add(tail)

  const wings = group()
  const sides = []
  for (const side of [-1, 1]) {
    const w = makeBatWing(p.wing ?? tint(p.body, -0.2), 1)
    w.scale.x = side
    w.position.set(side * 0.14, 0.62, -0.06)
    w.userData.side = side
    wings.add(w)
    sides.push(w)
  }
  wings.userData.sides = sides
  body.add(wings)

  root.add(body)
  return { root, parts: { body, head, tail, wings, legs, anchors: { head, back: body, hip: tail } }, height: 0.95 }
}

export function buildGryphon(p) {
  const root = new THREE.Group()
  const body = group()

  body.add(part(geo.capsule(0.24, 0.34, 12), mat(p.body), { y: 0.5, rx: Math.PI / 2 }))
  body.add(part(geo.capsule(0.17, 0.26, 10), mat(p.belly), { y: 0.42, z: 0.08, rx: Math.PI / 2, s: [1, 1, 0.7] }))

  const legs = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = part(geo.capsule(0.06, 0.2, 8), mat(tint(p.body, -0.12)), { x: sx * 0.17, y: 0.18, z: sz * 0.18 })
      legs.push(leg)
      body.add(leg)
      // Когти
      body.add(part(geo.box(0.14, 0.05, 0.16), mat(p.horn), { x: sx * 0.17, y: 0.03, z: sz * 0.18 + 0.04 }))
    }
  }

  const head = group()
  head.add(part(geo.sphere(0.19, 14, 12), mat(p.belly), { s: [1, 1.05, 1] }))
  head.add(part(geo.cone(0.09, 0.22, 8), mat(p.horn), { y: -0.02, z: 0.2, rx: Math.PI / 2 }))
  // Хохолок
  for (let i = -1; i <= 1; i++) {
    head.add(part(geo.cone(0.04, 0.16, 5), mat(p.body), { x: i * 0.08, y: 0.19, rz: i * 0.3, rx: -0.25 }))
  }
  head.add(eyes(p.eye, 0.045, 0.095, 0.15, 0.05))
  head.position.set(0, 0.76, 0.24)
  body.add(head)
  body.add(part(geo.cyl(0.1, 0.13, 0.2, 10), mat(p.belly), { y: 0.64, z: 0.2, rx: 0.4 }))

  const tail = group()
  tail.add(part(geo.capsule(0.08, 0.34, 8), mat(tint(p.body, -0.1)), { z: -0.2, rx: Math.PI / 2 }))
  for (let i = 0; i < 3; i++) {
    tail.add(part(geo.capsule(0.05, 0.2, 6), mat(p.horn), { x: (i - 1) * 0.07, z: -0.44, rx: Math.PI / 2 + 0.1, s: [1, 1, 0.4] }))
  }
  tail.position.set(0, 0.48, -0.3)
  body.add(tail)

  const wings = group()
  const sides = []
  for (const side of [-1, 1]) {
    const w = makeFeatherWing(p.wing ?? p.body, p.belly, 1.15)
    w.scale.x = side
    w.position.set(side * 0.16, 0.66, -0.04)
    w.userData.side = side
    wings.add(w)
    sides.push(w)
  }
  wings.userData.sides = sides
  body.add(wings)

  root.add(body)
  return { root, parts: { body, head, tail, wings, legs, anchors: { head, back: body, hip: tail } }, height: 1.05 }
}

/** Тёмная тварь: колючий тёмный комок с горящими глазами. */
export function buildRaider() {
  const root = new THREE.Group()
  const body = group()

  const shell = part(geo.icosa(0.44, 1), mat(0x3b2a52, { flatShading: true }), { y: 0.42, s: [1, 0.85, 1] })
  body.add(shell)
  body.add(part(geo.sphere(0.3, 12, 10), mat(0x241a34), { y: 0.36, s: [1, 0.7, 1] }))

  // Шипы
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    body.add(
      part(geo.cone(0.06, 0.24, 5), mat(0x6f4bb0), {
        x: Math.cos(a) * 0.3,
        y: 0.6 + Math.sin(i * 1.7) * 0.06,
        z: Math.sin(a) * 0.3,
        rx: Math.sin(a) * 0.7,
        rz: -Math.cos(a) * 0.7,
      }),
    )
  }

  const head = group()
  head.add(eyes(0xff4d3d, 0.07, 0.13, 0.3, 0.02))
  for (const side of [-1, 1]) {
    head.add(part(geo.sphere(0.09, 10, 8), glass(0xff5533, 0.35), { x: side * 0.13, y: 0.02, z: 0.3, shadow: false }))
  }
  head.position.y = 0.4
  body.add(head)

  // Кривые лапки
  const legs = []
  for (const side of [-1, 1]) {
    const leg = part(geo.capsule(0.05, 0.14, 6), mat(0x2b1f3d), { x: side * 0.2, y: 0.12, z: 0.05 })
    legs.push(leg)
    body.add(leg)
  }

  // Зубастый рот
  body.add(part(geo.cone(0.1, 0.14, 3), mat(0xffe8d0), { y: 0.24, z: 0.36, rx: Math.PI / 2, s: [1, 1, 0.4] }))

  root.add(body)
  return { root, parts: { body, head, shell, legs, anchors: { head, back: body, hip: body } }, height: 0.9, hopper: true }
}
