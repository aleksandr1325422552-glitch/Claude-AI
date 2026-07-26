import * as THREE from 'three'
import { eyes, geo, glass, group, mat, part, tint } from './common.js'

/**
 * Модели «девушек»: фея, русалка, ведьма.
 *
 * Все модели смотрят в +Z, стоят на y = 0 и складываются в одинаковую
 * структуру `parts`, чтобы один аниматор подходил всем.
 */

/**
 * Голова с волосами и лицом.
 *
 * Камера смотрит на ферму сверху под углом, поэтому причёска сдвинута назад:
 * иначе с высоты видна только «шапка волос», а лица нет.
 */
function makeHead(p, { hairStyle = 'bob' } = {}) {
  const head = group()
  head.add(part(geo.sphere(0.21, 16, 12), mat(p.skin), { y: 0, s: [1, 1.06, 0.97] }))

  // Волосы — только затылок и «челка» сверху-сзади
  head.add(part(geo.sphere(0.212, 16, 12), mat(p.hair), { y: 0.04, z: -0.075, s: [1.04, 1, 0.94] }))
  head.add(part(geo.sphere(0.13, 12, 8), mat(p.hair), { y: 0.15, z: -0.03, s: [1.35, 0.75, 1.1] }))

  if (hairStyle === 'long') {
    head.add(part(geo.capsule(0.14, 0.44, 10), mat(p.hair), { y: -0.26, z: -0.19, s: [1.15, 1, 0.6] }))
  } else if (hairStyle === 'buns') {
    for (const side of [-1, 1]) {
      head.add(part(geo.sphere(0.1, 10, 8), mat(p.hair), { x: side * 0.22, y: 0.1, z: -0.06 }))
    }
    head.add(part(geo.capsule(0.09, 0.2, 8), mat(p.hair), { y: -0.16, z: -0.18, s: [1.1, 1, 0.6] }))
  } else {
    head.add(part(geo.sphere(0.2, 12, 10), mat(p.hair), { y: -0.04, z: -0.15, s: [1.05, 1.1, 0.7] }))
  }

  // Глаза крупные и подняты выше — так они видны с высоты камеры
  head.add(eyes(p.eye, 0.05, 0.085, 0.185, 0.035))
  for (const side of [-1, 1]) {
    head.add(part(geo.sphere(0.04, 8, 6), mat(tint(0xff9db4, 0.1)), { x: side * 0.14, y: -0.04, z: 0.15, s: [1, 0.6, 0.4], shadow: false }))
  }
  // Улыбка
  head.add(part(geo.torus(0.045, 0.012, 10, 6), mat(0xc4607a), { y: -0.1, z: 0.185, rx: 0.5, shadow: false }))
  return head
}

function makeArm(p, side) {
  const arm = group()
  arm.add(part(geo.capsule(0.06, 0.24, 8), mat(p.dress), { y: -0.13 }))
  arm.add(part(geo.sphere(0.062, 8, 6), mat(p.skin), { y: -0.29 }))
  arm.position.set(side * 0.19, 0.79, 0)
  // Руки чуть в стороны — иначе сверху сливаются с платьем
  arm.rotation.z = side * 0.24
  return arm
}

function makeLeg(p, side) {
  const leg = group()
  leg.add(part(geo.capsule(0.062, 0.22, 8), mat(p.skin), { y: -0.13 }))
  leg.add(part(geo.box(0.13, 0.07, 0.2), mat(tint(p.trim, -0.25)), { y: -0.27, z: 0.03 }))
  leg.position.set(side * 0.09, 0.36, 0)
  return leg
}

/**
 * Прозрачные крылышки феи. Отклонены назад — плоские крылья, стоящие строго
 * вертикально, с высоты камеры превращаются в невидимую полоску.
 */
export function makeFairyWings(p) {
  const wings = group()
  const color = p.wing ?? 0xa8e8ff
  const wingMat = glass(color, 0.78, { emissive: tint(color, -0.45) })
  const edgeMat = mat(0xffffff, { emissive: 0x557799 })
  const sides = []
  for (const side of [-1, 1]) {
    const w = group()
    // Два лепестка на крыло: верхний крупнее, нижний поменьше
    w.add(part(geo.sphere(0.26, 14, 10), wingMat, { x: side * 0.26, y: 0.16, s: [0.9, 1.35, 0.12], rz: side * -0.45, shadow: false }))
    w.add(part(geo.sphere(0.19, 14, 10), wingMat, { x: side * 0.26, y: -0.16, s: [0.85, 1.05, 0.12], rz: side * -0.12, shadow: false }))
    // Светлая кромка делает крыло заметным на зелёном фоне
    w.add(part(geo.torus(0.24, 0.016, 14), edgeMat, { x: side * 0.26, y: 0.16, s: [0.9, 1.35, 0.3], rz: side * -0.45, shadow: false }))
    w.position.set(0, 0.84, -0.17)
    w.userData.side = side
    wings.add(w)
    sides.push(w)
  }
  wings.rotation.x = -0.5
  wings.userData.sides = sides
  return wings
}

// ===========================================================================

export function buildFairy(p) {
  const root = new THREE.Group()
  const body = group()

  const legL = makeLeg(p, -1)
  const legR = makeLeg(p, 1)
  body.add(legL, legR)

  // Платье-колокольчик: пошире, чтобы силуэт читался с высоты камеры
  body.add(part(geo.cone(0.33, 0.4, 14), mat(p.dress), { y: 0.54 }))
  body.add(part(geo.torus(0.3, 0.03, 16), mat(p.trim), { y: 0.36, rx: Math.PI / 2 }))
  body.add(part(geo.capsule(0.155, 0.2, 12), mat(p.dress), { y: 0.76 }))
  body.add(part(geo.sphere(0.06, 8, 6), mat(p.skin), { y: 0.92 }))

  const armL = makeArm(p, -1)
  const armR = makeArm(p, 1)
  body.add(armL, armR)

  const head = makeHead(p, { hairStyle: 'buns' })
  head.position.y = 1.14
  body.add(head)

  // Венок
  head.add(part(geo.torus(0.17, 0.022, 14), mat(p.trim), { y: 0.15, rx: Math.PI / 2 }))
  head.add(part(geo.sphere(0.045, 8, 6), mat(0xff8fbf), { y: 0.16, z: 0.16 }))

  const wings = makeFairyWings(p)
  body.add(wings)

  root.add(body)
  return {
    root,
    parts: { body, head, armL, armR, legL, legR, wings, anchors: { head, back: body, hip: body } },
    height: 1.45,
  }
}

export function buildMermaid(p) {
  const root = new THREE.Group()
  const body = group()

  // Хвост вместо ног — русалка «скользит» по траве
  const tail = group()
  tail.add(part(geo.capsule(0.17, 0.3, 12), mat(p.dress), { y: -0.16, s: [1, 1, 0.85] }))
  tail.add(part(geo.cone(0.12, 0.26, 10), mat(tint(p.dress, -0.15)), { y: -0.4, rx: Math.PI }))
  for (const side of [-1, 1]) {
    tail.add(part(geo.cone(0.1, 0.26, 6), mat(p.trim), { x: side * 0.12, y: -0.55, rz: side * 0.9, s: [1, 1, 0.25] }))
  }
  tail.position.y = 0.52
  body.add(tail)

  body.add(part(geo.torus(0.19, 0.03, 16), mat(p.trim), { y: 0.55, rx: Math.PI / 2 }))
  body.add(part(geo.capsule(0.155, 0.18, 12), mat(p.skin), { y: 0.78 }))
  body.add(part(geo.sphere(0.17, 12, 10), mat(p.dress), { y: 0.72, s: [1.02, 0.55, 1.02] }))

  const armL = makeArm(p, -1)
  const armR = makeArm(p, 1)
  armL.position.y = armR.position.y = 0.81
  body.add(armL, armR)

  const head = makeHead(p, { hairStyle: 'long' })
  head.position.y = 1.14
  body.add(head)

  // Ушки-плавники и жемчужина в волосах
  for (const side of [-1, 1]) {
    head.add(part(geo.cone(0.075, 0.17, 6), mat(p.trim), { x: side * 0.21, y: 0.01, rz: side * -1.2, s: [1, 1, 0.3] }))
  }
  head.add(part(geo.sphere(0.045, 10, 8), mat(0xfff8ff, { emissive: 0x445566 }), { x: 0.15, y: 0.12, z: 0.08 }))

  root.add(body)
  return {
    root,
    parts: { body, head, armL, armR, tail, anchors: { head, back: body, hip: tail } },
    height: 1.45,
  }
}

export function buildWitch(p) {
  const root = new THREE.Group()
  const body = group()

  const legL = makeLeg(p, -1)
  const legR = makeLeg(p, 1)
  body.add(legL, legR)

  // Длинная мантия
  body.add(part(geo.cone(0.32, 0.62, 14), mat(p.dress), { y: 0.42 }))
  body.add(part(geo.capsule(0.16, 0.2, 12), mat(p.dress), { y: 0.78 }))
  body.add(part(geo.torus(0.2, 0.03, 16), mat(p.trim), { y: 0.66, rx: Math.PI / 2 }))
  body.add(part(geo.sphere(0.06, 8, 6), mat(p.skin), { y: 0.94 }))

  // Плащ
  const cape = part(geo.sphere(0.3, 14, 10), mat(tint(p.wing ?? p.dress, -0.3)), {
    y: 0.66,
    z: -0.14,
    s: [1.05, 1.35, 0.32],
  })
  body.add(cape)

  const armL = makeArm(p, -1)
  const armR = makeArm(p, 1)
  body.add(armL, armR)

  // Метла в правой руке
  const broom = group()
  broom.add(part(geo.cyl(0.022, 0.022, 0.9, 8), mat(0x8a5a30), {}))
  broom.add(part(geo.cone(0.1, 0.26, 8), mat(0xd8b361), { y: -0.52, rx: Math.PI }))
  broom.position.set(0, -0.16, 0.06)
  broom.rotation.z = 0.18
  armR.add(broom)

  const head = makeHead(p, { hairStyle: 'long' })
  head.position.y = 1.14
  body.add(head)

  // Шляпа
  const hat = group()
  hat.add(part(geo.cyl(0.28, 0.34, 0.035, 16), mat(tint(p.dress, -0.2)), { y: 0.15 }))
  hat.add(part(geo.cone(0.19, 0.46, 14), mat(tint(p.dress, -0.1)), { y: 0.39 }))
  hat.add(part(geo.torus(0.185, 0.025, 14), mat(p.trim), { y: 0.19, rx: Math.PI / 2 }))
  hat.add(part(geo.sphere(0.05, 10, 8), mat(p.trim, { emissive: 0x554400 }), { y: 0.63, z: 0.03 }))
  head.add(hat)

  root.add(body)
  return {
    root,
    parts: { body, head, armL, armR, legL, legR, cape, broom, anchors: { head, back: body, hip: body } },
    height: 1.6,
  }
}
