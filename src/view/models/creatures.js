import { geo, glass, group, mat, part, tint } from './common.js'
import { buildFairy, buildMermaid, buildWitch, makeFairyWings } from './girls.js'
import { buildDragonling, buildGryphon, buildSlime, makeBatWing, makeFeatherWing } from './monsters.js'
import { clamp, damp } from '../../core/util.js'

const BUILDERS = {
  fairy: buildFairy,
  mermaid: buildMermaid,
  witch: buildWitch,
  slime: buildSlime,
  dragonling: buildDragonling,
  gryphon: buildGryphon,
}

/**
 * Собирает модель по описанию вида. У гибридов к основе (`model`) добавляются
 * черты второго родителя (`graftModel`) — рога, крылья, хвост или шляпа.
 */
export function buildCreatureModel(def) {
  const build = BUILDERS[def.model] ?? buildSlime
  const model = build(def.palette)
  if (def.graftModel && def.graftModel !== def.model) applyGraft(model, def)
  return model
}

// ===========================================================================
//                          Черты второго родителя
// ===========================================================================

function applyGraft(model, def) {
  const p = def.palette
  const color = p.graft ?? 0xaaaaaa
  const accent = p.graftAccent ?? 0xffffff
  const { head, back } = model.parts.anchors

  switch (def.graftModel) {
    case 'fairy': {
      const wings = makeFairyWings({ wing: color })
      back.add(wings)
      model.parts.wings2 = wings
      head.add(part(geo.torus(0.16, 0.02, 12), mat(accent), { y: 0.16, rx: Math.PI / 2 }))
      break
    }
    case 'mermaid': {
      for (const side of [-1, 1]) {
        head.add(part(geo.cone(0.07, 0.16, 6), mat(color), { x: side * 0.2, y: 0.02, rz: side * -1.15, s: [1, 1, 0.3] }))
      }
      const fin = group(part(geo.cone(0.13, 0.3, 6), mat(color), { rx: Math.PI, s: [1, 1, 0.28] }))
      fin.position.set(0, 0.24, -0.26)
      back.add(fin)
      model.parts.tail = model.parts.tail ?? fin
      break
    }
    case 'witch': {
      const hat = group()
      hat.add(part(geo.cyl(0.26, 0.31, 0.035, 14), mat(tint(color, -0.15)), { y: 0.16 }))
      hat.add(part(geo.cone(0.18, 0.42, 12), mat(color), { y: 0.38 }))
      hat.add(part(geo.torus(0.17, 0.022, 12), mat(accent), { y: 0.19, rx: Math.PI / 2 }))
      head.add(hat)
      break
    }
    case 'slime': {
      const dome = part(geo.sphere(0.24, 14, 10), glass(color, 0.7, { depthWrite: true }), { y: 0.16, s: [1.1, 0.7, 1.1] })
      head.add(dome)
      const tail = group(
        part(geo.sphere(0.14, 12, 10), glass(color, 0.8, { depthWrite: true }), { s: [1, 0.8, 1.3] }),
        part(geo.sphere(0.09, 10, 8), glass(color, 0.8, { depthWrite: true }), { z: -0.18, s: [1, 0.8, 1.2] }),
      )
      tail.position.set(0, 0.3, -0.3)
      back.add(tail)
      model.parts.tail = model.parts.tail ?? tail
      break
    }
    case 'dragonling': {
      for (const side of [-1, 1]) {
        head.add(part(geo.cone(0.05, 0.22, 6), mat(accent), { x: side * 0.13, y: 0.2, z: -0.02, rz: side * 0.45, rx: -0.15 }))
      }
      const wings = group()
      const sides = []
      for (const side of [-1, 1]) {
        const w = makeBatWing(color, 0.95)
        w.scale.x = side
        w.position.set(side * 0.13, 0.82, -0.16)
        w.userData.side = side
        wings.add(w)
        sides.push(w)
      }
      wings.userData.sides = sides
      back.add(wings)
      model.parts.wings2 = wings

      const tail = group(
        part(geo.cone(0.1, 0.46, 8), mat(color), { z: -0.2, rx: -Math.PI / 2 }),
        part(geo.cone(0.08, 0.14, 5), mat(accent), { z: -0.44, rx: -Math.PI / 2, s: [1, 1, 0.4] }),
      )
      tail.position.set(0, 0.34, -0.24)
      back.add(tail)
      model.parts.tail = model.parts.tail ?? tail
      break
    }
    case 'gryphon': {
      const wings = group()
      const sides = []
      for (const side of [-1, 1]) {
        const w = makeFeatherWing(color, accent, 1.05)
        w.scale.x = side
        w.position.set(side * 0.15, 0.84, -0.14)
        w.userData.side = side
        wings.add(w)
        sides.push(w)
      }
      wings.userData.sides = sides
      back.add(wings)
      model.parts.wings2 = wings
      for (let i = -1; i <= 1; i++) {
        head.add(part(geo.cone(0.04, 0.15, 5), mat(accent), { x: i * 0.08, y: 0.2, rz: i * 0.3, rx: -0.25 }))
      }
      break
    }
    default:
      break
  }
}

// ===========================================================================
//                                 Анимация
// ===========================================================================

/** Запоминает исходное положение детали, чтобы анимировать вокруг него. */
function base(obj, key, value) {
  if (obj.userData[key] === undefined) obj.userData[key] = value
  return obj.userData[key]
}

/**
 * Одна процедура анимации на все модели: что есть в `parts`, то и шевелится.
 *
 * info = { phase, walk (0..1), eating, working, faint (0..1), dt }
 */
export function animateModel(model, info) {
  const p = model.parts
  const { phase, walk, dt } = info
  const stride = clamp(walk, 0, 1)

  // --- корпус ---
  if (p.body) {
    if (model.hopper) {
      const hop = Math.abs(Math.sin(phase * 1.35))
      const squash = 1 - hop
      p.body.position.y = hop * 0.16 * (0.35 + stride)
      p.body.scale.set(1 + squash * 0.1, 1 - squash * 0.13, 1 + squash * 0.1)
    } else {
      p.body.position.y = Math.sin(phase * 2) * (0.01 + stride * 0.028)
      p.body.rotation.z = Math.sin(phase) * 0.03 * stride
    }
  }

  // --- ноги ---
  if (p.legL && p.legR) {
    const swing = Math.sin(phase * 2) * 0.5 * stride
    p.legL.rotation.x = swing
    p.legR.rotation.x = -swing
  }
  if (Array.isArray(p.legs)) {
    p.legs.forEach((leg, i) => {
      const by = base(leg, 'by', leg.position.y)
      const step = Math.sin(phase * 2 + i * (Math.PI / 2))
      leg.position.y = by + Math.max(0, step) * 0.05 * stride
      leg.rotation.x = step * 0.35 * stride
    })
  }

  // --- руки ---
  if (p.armL && p.armR) {
    const swing = Math.sin(phase * 2) * 0.45 * stride
    const idle = Math.sin(phase * 0.8) * 0.06
    p.armL.rotation.x = -swing + idle
    p.armR.rotation.x = swing + idle
    if (info.eating) {
      p.armL.rotation.x = damp(p.armL.rotation.x, -0.9, 8, dt)
      p.armR.rotation.x = damp(p.armR.rotation.x, -0.9, 8, dt)
    }
  }

  // --- крылья ---
  const flapSpeed = info.eating ? 1.6 : 3.1 + stride * 2.4
  const flap = 0.16 + Math.sin(phase * flapSpeed) * (0.22 + stride * 0.2)
  for (const wings of [p.wings, p.wings2]) {
    if (!wings?.userData?.sides) continue
    for (const w of wings.userData.sides) w.rotation.z = flap * (w.userData.side ?? 1)
  }

  // --- хвост ---
  if (p.tail) {
    p.tail.rotation.y = Math.sin(phase * 1.3) * (0.16 + stride * 0.2)
    p.tail.rotation.x = base(p.tail, 'brx', p.tail.rotation.x) + Math.sin(phase * 2.1) * 0.06
  }

  // --- голова ---
  if (p.head) {
    const want = info.eating ? 0.62 : Math.sin(phase * 1.1) * 0.05
    p.head.rotation.x = damp(p.head.rotation.x, want, 7, dt)
    p.head.rotation.y = damp(p.head.rotation.y, info.eating ? 0 : Math.sin(phase * 0.45) * 0.3, 3, dt)
  }

  // --- обморок ---
  if (info.faint > 0) {
    model.root.rotation.z = damp(model.root.rotation.z, 1.45, 5, dt)
    model.root.position.y = -info.faint * 0.12
  } else if (model.root.rotation.z !== 0) {
    model.root.rotation.z = damp(model.root.rotation.z, 0, 8, dt)
    model.root.position.y = 0
  }
}
