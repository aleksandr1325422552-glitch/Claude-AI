import * as THREE from 'three'
import { geo, mat, part, tint } from './models/common.js'
import { animateModel, buildCreatureModel } from './models/creatures.js'
import { buildRaider } from './models/monsters.js'
import { buildItemModel, buildItemRing } from './models/items.js'
import { CSTATE, STAGE } from '../sim/Creature.js'
import { RSTATE } from '../sim/Raider.js'
import { clamp, damp } from '../core/util.js'
import { isHybrid } from '../data/species.js'

// ===========================================================================
//                     Иконки состояний (рисуются вектором)
// ===========================================================================

const iconCache = new Map()

function iconTexture(kind) {
  if (iconCache.has(kind)) return iconCache.get(kind)
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const c = canvas.getContext('2d')
  const border = { hungry: '#4fbf8b', starving: '#e8543f', baby: '#ffc63f', hybrid: '#8b5cf6' }[kind] ?? '#666'

  // Пузырь
  c.beginPath()
  c.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2)
  c.fillStyle = 'rgba(255,255,255,0.95)'
  c.fill()
  c.lineWidth = 7
  c.strokeStyle = border
  c.stroke()

  c.save()
  c.translate(size / 2, size / 2)
  if (kind === 'hungry') {
    // Кустик травы
    c.strokeStyle = '#3f9c68'
    c.lineWidth = 8
    c.lineCap = 'round'
    for (const [dx, dy] of [
      [-16, 6],
      [0, 10],
      [16, 6],
    ]) {
      c.beginPath()
      c.moveTo(dx, 20)
      c.quadraticCurveTo(dx * 1.5, 0, dx * 1.1, -dy - 12)
      c.stroke()
    }
  } else if (kind === 'starving') {
    // Восклицательный знак
    c.fillStyle = '#e8543f'
    c.beginPath()
    c.moveTo(-7, -26)
    c.lineTo(7, -26)
    c.lineTo(5, 10)
    c.lineTo(-5, 10)
    c.closePath()
    c.fill()
    c.beginPath()
    c.arc(0, 22, 7.5, 0, Math.PI * 2)
    c.fill()
  } else if (kind === 'baby') {
    // Стрелка роста
    c.fillStyle = '#d99a12'
    c.beginPath()
    c.moveTo(0, -28)
    c.lineTo(22, 0)
    c.lineTo(9, 0)
    c.lineTo(9, 26)
    c.lineTo(-9, 26)
    c.lineTo(-9, 0)
    c.lineTo(-22, 0)
    c.closePath()
    c.fill()
  } else if (kind === 'hybrid') {
    // Две сцепленные спирали
    c.strokeStyle = '#8b5cf6'
    c.lineWidth = 7
    c.lineCap = 'round'
    for (const dir of [-1, 1]) {
      c.beginPath()
      c.moveTo(dir * 16, -24)
      c.bezierCurveTo(dir * -16, -8, dir * -16, 8, dir * 16, 24)
      c.stroke()
    }
    c.lineWidth = 5
    for (const y of [-10, 2, 14]) {
      c.beginPath()
      c.moveTo(-11, y)
      c.lineTo(11, y)
      c.stroke()
    }
  }
  c.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  iconCache.set(kind, texture)
  return texture
}

function makeIconSprite() {
  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(0.5)
  sprite.visible = false
  sprite.renderOrder = 10
  return sprite
}

/** Полоска прогресса над персонажем — тонкая, чтобы не спорить с моделью. */
function makeBar(width = 0.52, color = 0x4fbf8b) {
  const g = new THREE.Group()
  const bg = part(geo.box(width, 0.065, 0.04), mat(0x4a4257), { shadow: false })
  const fill = part(geo.box(width, 0.065, 0.06), mat(color, { emissive: tint(color, -0.5) }), { z: 0.02, shadow: false })
  g.add(bg, fill)
  g.visible = false
  g.userData = { width, fill }
  return g
}

/** Общие множители размера — чтобы всё было хорошо видно с камеры. */
const CREATURE_SCALE = 1.35
const DROP_SCALE = 1.55

function setBar(bar, p) {
  const { width, fill } = bar.userData
  const v = clamp(p, 0.001, 1)
  fill.scale.x = v
  fill.position.x = -(1 - v) * (width / 2)
}

// ===========================================================================
//                              Живые объекты
// ===========================================================================

/**
 * Отвечает за всё, что появляется и исчезает во время игры: существ,
 * товары на земле и тёмных тварей. Каждый кадр сверяет список видов
 * с состоянием симуляции.
 */
export class FarmView {
  constructor(scene, farm) {
    this.scene = scene
    this.farm = farm
    this.creatures = new Map()
    this.drops = new Map()
    this.raiders = new Map()
    this.pickTargets = []
    this.dirtyPicks = true
  }

  /** Переключение на новый уровень. */
  setFarm(farm) {
    this.clear()
    this.farm = farm
    this.dirtyPicks = true
  }

  update(dt, time) {
    this.#syncCreatures(dt, time)
    this.#syncDrops(dt, time)
    this.#syncRaiders(dt, time)
    if (this.dirtyPicks) this.#rebuildPicks()
  }

  #rebuildPicks() {
    this.pickTargets.length = 0
    for (const v of this.creatures.values()) this.pickTargets.push(v.hit)
    for (const v of this.drops.values()) this.pickTargets.push(v.hit)
    for (const v of this.raiders.values()) this.pickTargets.push(v.hit)
    this.dirtyPicks = false
  }

  // ------------------------------------------------------------- существа ---

  #syncCreatures(dt, time) {
    const alive = new Set()

    for (const creature of this.farm.creatures) {
      alive.add(creature.id)
      let view = this.creatures.get(creature.id)
      if (!view) {
        view = this.#createCreatureView(creature)
        this.creatures.set(creature.id, view)
        this.dirtyPicks = true
      }
      this.#updateCreatureView(view, creature, dt, time)
    }

    for (const [id, view] of this.creatures) {
      if (alive.has(id)) continue
      this.scene.remove(view.root)
      this.creatures.delete(id)
      this.dirtyPicks = true
    }
  }

  #createCreatureView(creature) {
    const root = new THREE.Group()
    const model = buildCreatureModel(creature.def)
    root.add(model.root)

    const bar = makeBar(0.6, isHybrid(creature.speciesId) ? 0x8b5cf6 : 0x4fbf8b)
    bar.position.y = model.height + 0.34
    root.add(bar)

    const icon = makeIconSprite()
    icon.position.y = model.height + 0.62
    root.add(icon)

    const hit = new THREE.Mesh(geo.sphere(0.62, 10, 8), new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.y = model.height * 0.55
    hit.userData = { kind: 'creature', id: creature.id }
    root.add(hit)

    root.position.set(creature.x, 0, creature.z)
    root.rotation.y = creature.heading
    this.scene.add(root)

    return { root, model, bar, icon, hit, scale: 0.4, stage: creature.stage }
  }

  #updateCreatureView(view, creature, dt, time) {
    const { root, model } = view

    root.position.x = creature.x
    root.position.z = creature.z
    root.rotation.y = damp(root.rotation.y, creature.heading, 10, dt)

    // Малыш мельче взрослого; при взрослении размер плавно растёт.
    const wantScale = CREATURE_SCALE * creature.def.scale * (creature.isAdult ? 1 : 0.62)
    view.scale = damp(view.scale, wantScale, 4, dt)
    root.scale.setScalar(view.scale)

    animateModel(model, {
      phase: creature.animPhase,
      walk: clamp(creature.moveSpeed / Math.max(0.001, creature.def.speed), 0, 1),
      eating: creature.state === CSTATE.EAT,
      faint: creature.state === CSTATE.FAINT ? 1 : 0,
      dt,
    })

    // Полоска: у взрослого — готовность товара, у малыша — рост
    const working = creature.isAdult && creature.state === CSTATE.WORK
    const progress = working ? creature.progress : creature.isAdult ? -1 : creature.meals / Math.max(1, creature.def.mealsToGrow)
    view.bar.visible = progress >= 0.04
    if (view.bar.visible) setBar(view.bar, progress)
    view.bar.position.y = (model.height + 0.5) / Math.max(0.2, view.scale)
    view.bar.rotation.y = -root.rotation.y

    // Иконка состояния
    let icon = null
    if (creature.state === CSTATE.FAINT) icon = 'starving'
    else if (creature.starvation > 0.45) icon = 'starving'
    else if (creature.wantsFood && creature.starvation > 0.08) icon = 'hungry'
    else if (creature.stage === STAGE.BABY && creature.wantsFood) icon = 'baby'

    if (icon) {
      view.icon.visible = true
      if (view.icon.userData.kind !== icon) {
        view.icon.material.map = iconTexture(icon)
        view.icon.material.needsUpdate = true
        view.icon.userData.kind = icon
      }
      const pulse = icon === 'starving' ? 1 + Math.sin(time * 9) * 0.14 : 1
      view.icon.scale.setScalar((0.5 / Math.max(0.2, view.scale)) * pulse)
      view.icon.position.y = (model.height + 0.82 + Math.sin(time * 2.4) * 0.05) / Math.max(0.2, view.scale)
    } else {
      view.icon.visible = false
    }
  }

  // -------------------------------------------------------------- товары ---

  #syncDrops(dt, time) {
    const alive = new Set()

    for (const drop of this.farm.drops) {
      alive.add(drop.id)
      let view = this.drops.get(drop.id)
      if (!view) {
        const model = buildItemModel(drop.itemId)
        const root = new THREE.Group()
        root.add(model.root)
        const hit = new THREE.Mesh(geo.sphere(0.44, 10, 8), new THREE.MeshBasicMaterial({ visible: false }))
        hit.userData = { kind: 'drop', id: drop.id, itemId: drop.itemId }
        root.add(hit)
        // Кольцо лежит на земле отдельно от предмета, который подпрыгивает.
        const ring = buildItemRing(drop.itemId)
        this.scene.add(root, ring)
        view = { root, ring, model, hit, pop: 0 }
        this.drops.set(drop.id, view)
        this.dirtyPicks = true
      }

      view.pop = Math.min(1, view.pop + dt * 6)
      view.root.position.set(drop.x, drop.y, drop.z)
      // Товар заметно крупнее «натуральной» величины — иначе его не разглядеть.
      view.root.scale.setScalar(DROP_SCALE * (0.55 + view.pop * 0.45))
      view.model.body.rotation.y = drop.spin
      view.model.body.position.y = Math.sin(time * 2.6 + drop.spin) * 0.045

      // Пульсирующее кольцо-подсказка; мигает, когда товар скоро пропадёт.
      const dying = drop.life < 12
      const blink = Math.sin(time * 12) > 0
      view.ring.position.set(drop.x, 0.16, drop.z)
      view.ring.scale.setScalar(view.pop * (1 + Math.sin(time * 3.4) * 0.12))
      view.ring.material.opacity = dying ? (blink ? 0.9 : 0.15) : 0.55
      view.root.visible = !dying || Math.sin(time * 12) > -0.6
    }

    for (const [id, view] of this.drops) {
      if (alive.has(id)) continue
      this.scene.remove(view.root)
      this.scene.remove(view.ring)
      this.drops.delete(id)
      this.dirtyPicks = true
    }
  }

  // -------------------------------------------------------- тёмные твари ---

  #syncRaiders(dt, time) {
    const alive = new Set()

    for (const raider of this.farm.raiders) {
      alive.add(raider.id)
      let view = this.raiders.get(raider.id)
      if (!view) {
        view = this.#createRaiderView(raider)
        this.raiders.set(raider.id, view)
        this.dirtyPicks = true
      }
      this.#updateRaiderView(view, raider, dt, time)
    }

    for (const [id, view] of this.raiders) {
      if (alive.has(id)) continue
      this.scene.remove(view.root)
      this.raiders.delete(id)
      this.dirtyPicks = true
    }
  }

  #createRaiderView(raider) {
    const root = new THREE.Group()
    const model = buildRaider()
    root.add(model.root)

    // Пипсы здоровья: сколько кликов осталось
    const pips = new THREE.Group()
    pips.position.y = 1.28
    for (let i = 0; i < raider.maxHp; i++) {
      const pip = part(geo.sphere(0.075, 10, 8), mat(0xff6b52, { emissive: 0x661a10 }), {
        x: (i - (raider.maxHp - 1) / 2) * 0.22,
        shadow: false,
      })
      pips.add(pip)
    }
    root.add(pips)

    const hit = new THREE.Mesh(geo.sphere(0.7, 10, 8), new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.y = 0.5
    hit.userData = { kind: 'raider', id: raider.id }
    root.add(hit)

    root.position.set(raider.x, 0, raider.z)
    this.scene.add(root)
    return { root, model, pips, hit, carried: null }
  }

  #updateRaiderView(view, raider, dt, time) {
    view.root.position.x = raider.x
    view.root.position.z = raider.z
    view.root.rotation.y = damp(view.root.rotation.y, raider.heading, 9, dt)

    animateModel(view.model, {
      phase: raider.animPhase,
      walk: clamp(raider.moveSpeed / 2.6, 0, 1),
      eating: raider.state === RSTATE.EAT,
      faint: 0,
      dt,
    })

    view.pips.children.forEach((pip, i) => (pip.visible = i < raider.hp))
    view.pips.rotation.y = -view.root.rotation.y

    // Вспышка от удара
    const flash = Math.max(0, raider.flash)
    view.model.parts.shell.material = flash > 0 && Math.sin(time * 40) > 0 ? mat(0xffe0d0) : mat(0x3b2a52, { flatShading: true })

    if (raider.state === RSTATE.TRAPPED) {
      view.root.scale.setScalar(Math.max(0.05, view.root.scale.x - dt * 1.1))
      view.root.rotation.y += dt * 9
    } else if (raider.state === RSTATE.STUN) {
      view.root.rotation.z = Math.sin(time * 18) * 0.2
    } else {
      view.root.rotation.z = 0
    }

    // Украденный товар на «спине»
    if (raider.carrying && !view.carried) {
      const icon = buildItemModel(raider.carrying).root
      icon.position.y = 1.0
      icon.scale.setScalar(0.8)
      view.root.add(icon)
      view.carried = icon
    }
    if (view.carried) view.carried.rotation.y += dt * 2
  }

  clear() {
    for (const v of this.creatures.values()) this.scene.remove(v.root)
    for (const v of this.drops.values()) this.scene.remove(v.root, v.ring)
    for (const v of this.raiders.values()) this.scene.remove(v.root)
    this.creatures.clear()
    this.drops.clear()
    this.raiders.clear()
    this.pickTargets.length = 0
  }
}
