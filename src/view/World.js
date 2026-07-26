import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { geo, glass, mat, mergeStatic, part, tint } from './models/common.js'
import {
  buildBush,
  buildCage,
  buildCloud,
  buildEgg,
  buildFactory,
  buildFenceSection,
  buildFlower,
  buildNursery,
  buildPine,
  buildPond,
  buildRock,
  buildSignpost,
  buildTree,
  buildTruck,
  buildWarehouse,
  buildWell,
} from './models/props.js'
import { buildItemIcon } from './models/items.js'
import { FACTORY_SPOTS, PASTURE, SPOTS, pastureDepth, pastureWidth, tileCenter, tileCount } from '../data/layout.js'
import { FACTORIES } from '../data/recipes.js'
import { clamp, damp } from '../core/util.js'
import { Rng } from '../core/rng.js'

const GRASS = 0x6cbf59
const GRASS_DARK = 0x54a545
const SOIL = 0x8a6242
const SOIL_WET = 0x5f4230

/** Небо: вертикальный градиент на внутренней стороне большой сферы. */
function makeSky() {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0.0, '#2f6fd0')
  g.addColorStop(0.42, '#8fc9f0')
  g.addColorStop(0.62, '#cfe9f7')
  g.addColorStop(1.0, '#f7e6c4')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 16),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false }),
  )
  sky.name = 'sky'
  return sky
}

/** Кустик травы: пучок «листьев», слитый в одну геометрию. */
function makeTuftGeometry(rng) {
  const blades = []
  const blade = new THREE.ConeGeometry(0.075, 0.6, 4)
  for (let i = 0; i < 13; i++) {
    const g = blade.clone()
    const m = new THREE.Matrix4()
    const a = rng.range(0, Math.PI * 2)
    const r = rng.range(0, PASTURE.tile * 0.36)
    m.makeRotationZ(rng.range(-0.36, 0.36))
    m.multiply(new THREE.Matrix4().makeRotationX(rng.range(-0.32, 0.32)))
    m.setPosition(Math.cos(a) * r, 0.3, Math.sin(a) * r)
    g.applyMatrix4(m)
    blades.push(g)
  }
  const merged = mergeGeometries(blades)
  blade.dispose()
  blades.forEach((b) => b.dispose())
  return merged
}

/**
 * Сцена, свет, земля, постройки и управление камерой.
 * Всё, что относится к «декорациям», живёт здесь; движущиеся объекты — в FarmView.
 */
export class World {
  constructor(canvas, farm) {
    this.canvas = canvas
    this.farm = farm
    this.rng = new Rng(20240607)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xcfe4f2, 46, 96)
    this.scene.add(makeSky())

    /** Объекты, по которым бьёт луч курсора (грядки и постройки). */
    this.pickTargets = []

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 260)
    // Смотрим чуть выше центра выгона, чтобы в кадр попадал и ряд мастерских.
    this.target = new THREE.Vector3(0, 0, -0.8)
    this.wantTarget = this.target.clone()
    this.viewDir = new THREE.Vector3(0, 0.78, 0.72).normalize()
    // Приближение задаётся множителем к «вписывающему» расстоянию, поэтому
    // одинаково работает и на широком мониторе, и на телефоне.
    this.zoom = 1
    this.fitDistance = 27
    this.distance = 27
    this.wantDistance = 27

    /** 2 — полное качество, 1 — без сглаживания теней, 0 — совсем без теней. */
    this.quality = 2

    this.#setupLights()
    this.#buildGround()
    this.#buildTiles()
    this.#buildBuildings()
    this.#buildDecor()
    this.#buildClouds()

    this.#setupCameraControls()
    this.resize()
    this.#applyCamera(1)
  }

  /** Переключение на новый уровень: декорации остаются, данные обновляются. */
  setFarm(farm) {
    this.farm = farm
    for (const slot of this.nursery.eggSlots) {
      slot.clear()
      slot.visible = false
      slot.userData.eggId = null
    }
    this.truck.cargo.clear()
    this.truck.cargo.userData.key = null
    this.truck.root.position.x = SPOTS.truck.x
  }

  #setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6b8f4e, 1.55))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35))

    const sun = new THREE.DirectionalLight(0xfff3d8, 2.3)
    sun.position.set(-14, 24, 13)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -22
    sun.shadow.camera.right = 22
    sun.shadow.camera.top = 22
    sun.shadow.camera.bottom = -22
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 70
    sun.shadow.bias = -0.0012
    sun.shadow.normalBias = 0.02
    this.scene.add(sun)
    this.sun = sun

    // Мягкая подсветка снизу-сзади, чтобы тени не были чёрными.
    const fill = new THREE.DirectionalLight(0xbcd9ff, 0.5)
    fill.position.set(12, 9, -14)
    this.scene.add(fill)
  }

  #buildGround() {
    const ground = part(geo.circle(38, 56), mat(GRASS), { rx: -Math.PI / 2, shadow: true, cast: false })
    ground.receiveShadow = true
    ground.name = 'ground'
    this.scene.add(ground)
    this.ground = ground

    // Утоптанная площадка выгона
    const plot = part(geo.plane(pastureWidth + 1.5, pastureDepth + 1.5), mat(tint(GRASS_DARK, -0.06)), {
      x: PASTURE.center.x,
      y: 0.012,
      z: PASTURE.center.z,
      rx: -Math.PI / 2,
      shadow: false,
    })
    this.scene.add(plot)

    // Дорога к рынку
    const road = part(geo.plane(7.5, 3.4), mat(0xcbb08a), {
      x: SPOTS.truck.x + 2.4,
      y: 0.02,
      z: SPOTS.truck.z,
      rx: -Math.PI / 2,
      shadow: false,
    })
    this.scene.add(road)
    const roadLong = part(geo.plane(26, 3.4), mat(0xc4a781), { x: 20, y: 0.018, z: SPOTS.truck.z, rx: -Math.PI / 2, shadow: false })
    this.scene.add(roadLong)

    // Пруд рядом с выгоном
    const pond = buildPond()
    pond.position.set(-12.5, 0, 8.5)
    pond.scale.setScalar(0.85)
    this.scene.add(pond)
  }

  #buildTiles() {
    this.tileViews = []
    const tuftGeometries = [makeTuftGeometry(this.rng), makeTuftGeometry(this.rng), makeTuftGeometry(this.rng)]
    const grassMat = mat(0x5fbb4a)
    // Сухая земля → политая → заросшая травой: цвет грядки сразу показывает состояние.
    const soilMats = [mat(SOIL), mat(SOIL_WET), mat(0x4f9440)]
    const size = PASTURE.tile * 0.93
    const borders = new THREE.Group()

    for (let i = 0; i < tileCount; i++) {
      const { x, z } = tileCenter(i)
      const holder = new THREE.Group()
      holder.position.set(x, 0, z)

      const soil = part(geo.box(size, 0.12, size), soilMats[0], { y: 0.055, shadow: true, cast: false })
      soil.receiveShadow = true
      holder.add(soil)

      // Бортик грядки — неподвижен, поэтому уходит в общую склейку
      borders.add(part(geo.box(size + 0.1, 0.06, size + 0.1), mat(tint(SOIL, -0.3)), { x, y: 0.015, z, shadow: false }))

      const grass = new THREE.Mesh(tuftGeometries[i % tuftGeometries.length], grassMat)
      grass.position.y = 0.1
      grass.castShadow = false
      grass.receiveShadow = false
      grass.visible = false
      holder.add(grass)

      // Прозрачная «кнопка» на всю клетку
      const pick = new THREE.Mesh(geo.plane(size, size), new THREE.MeshBasicMaterial({ visible: false }))
      pick.rotation.x = -Math.PI / 2
      pick.position.y = 0.14
      pick.userData = { kind: 'tile', index: i }
      holder.add(pick)

      // Подсветка при наведении
      const glow = part(geo.plane(size, size), glass(0xffffff, 0.22), { y: 0.13, rx: -Math.PI / 2, shadow: false })
      glow.visible = false
      holder.add(glow)

      this.scene.add(holder)
      this.pickTargets.push(pick)
      this.tileViews.push({ soil, grass, pick, glow, soilMats })
    }

    this.scene.add(mergeStatic(borders, { castShadow: false }))
  }

  #buildBuildings() {
    this.well = buildWell()
    this.well.root.position.set(SPOTS.well.x, 0, SPOTS.well.z)
    this.well.root.rotation.y = 0.4
    this.#registerPick(this.well.root, { kind: 'well' }, 1.25, 1.0)
    this.scene.add(this.well.root)

    this.warehouse = buildWarehouse()
    this.warehouse.root.position.set(SPOTS.warehouse.x, 0, SPOTS.warehouse.z)
    this.warehouse.root.rotation.y = -0.35
    this.#registerPick(this.warehouse.root, { kind: 'warehouse' }, 1.6, 1.1)
    this.scene.add(this.warehouse.root)

    this.nursery = buildNursery()
    this.nursery.root.position.set(SPOTS.nursery.x, 0, SPOTS.nursery.z)
    this.#registerPick(this.nursery.root, { kind: 'nursery' }, 1.5, 1.0)
    this.scene.add(this.nursery.root)

    this.cage = buildCage()
    this.cage.root.position.set(SPOTS.cage.x, 0, SPOTS.cage.z)
    this.#registerPick(this.cage.root, { kind: 'cage' }, 1.25, 0.9)
    this.scene.add(this.cage.root)

    this.truck = buildTruck()
    this.truck.root.position.set(SPOTS.truck.x, 0, SPOTS.truck.z)
    this.truck.root.rotation.y = Math.PI / 2
    this.#registerPick(this.truck.root, { kind: 'truck' }, 1.4, 1.0)
    this.scene.add(this.truck.root)

    const post = buildSignpost()
    post.position.set(SPOTS.sign.x, 0, SPOTS.sign.z)
    post.rotation.y = 0.3
    this.scene.add(mergeStatic(post))

    // Мастерские: строим все, показываем только доступные.
    this.factoryViews = new Map()
    for (const def of Object.values(FACTORIES)) {
      const view = buildFactory(def)
      const spot = FACTORY_SPOTS[def.id]
      view.root.position.set(spot.x, 0, spot.z)
      view.root.visible = false
      this.#registerPick(view.root, { kind: 'factory', id: def.id }, 1.5, 1.1)
      this.scene.add(view.root)
      this.factoryViews.set(def.id, view)
    }
  }

  /** Добавляет к постройке невидимую сферу-цель для курсора. */
  #registerPick(root, userData, radius, y) {
    const hit = new THREE.Mesh(geo.sphere(radius, 10, 8), new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.y = y
    hit.userData = userData
    root.add(hit)
    root.userData.hit = hit
    this.pickTargets.push(hit)
    return hit
  }

  #buildDecor() {
    // Забор вокруг выгона
    const fence = new THREE.Group()
    const halfW = pastureWidth / 2 + 0.9
    const halfD = pastureDepth / 2 + 0.9
    const step = 1.75
    for (let x = -halfW; x <= halfW - 0.1; x += step) {
      for (const z of [-halfD, halfD]) {
        const s = buildFenceSection(x + step <= halfW + 0.01)
        s.position.set(PASTURE.center.x + x, 0, PASTURE.center.z + z)
        fence.add(s)
      }
    }
    for (let z = -halfD; z <= halfD - 0.1; z += step) {
      for (const x of [-halfW, halfW]) {
        const s = buildFenceSection(z + step <= halfD + 0.01)
        s.rotation.y = Math.PI / 2
        s.position.set(PASTURE.center.x + x, 0, PASTURE.center.z + z)
        fence.add(s)
      }
    }
    this.scene.add(mergeStatic(fence))

    // Деревья, камни, кусты и цветы по краям — но не на постройках
    const blocked = [...Object.values(SPOTS), ...Object.values(FACTORY_SPOTS), { x: -12.5, z: 8.5 }]
    const okSpot = (x, z) => {
      if (Math.abs(x) < pastureWidth / 2 + 2.2 && Math.abs(z - PASTURE.center.z) < pastureDepth / 2 + 2.2) return false
      if (Math.abs(z - SPOTS.truck.z) < 2.6 && x > 4) return false
      return blocked.every((b) => Math.hypot(b.x - x, b.z - z) > 4.2)
    }

    const decor = new THREE.Group()
    let placed = 0
    for (let attempt = 0; attempt < 900 && placed < 46; attempt++) {
      const a = this.rng.range(0, Math.PI * 2)
      const r = this.rng.range(11, 25)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r * 0.8
      if (!okSpot(x, z)) continue
      const roll = this.rng.next()
      let item
      if (roll < 0.34) item = buildTree(this.rng.int(0, 2))
      else if (roll < 0.58) item = buildPine(this.rng.int(0, 1))
      else if (roll < 0.74) item = buildRock(this.rng.int(0, 3))
      else item = buildBush(this.rng.int(0, 1))
      item.position.set(x, 0, z)
      item.rotation.y = this.rng.range(0, Math.PI * 2)
      item.scale.setScalar(this.rng.range(0.85, 1.3))
      decor.add(item)
      placed++
    }

    // Цветы — мелкие, можно и поближе
    for (let i = 0; i < 110; i++) {
      const a = this.rng.range(0, Math.PI * 2)
      const r = this.rng.range(9, 26)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r * 0.8
      if (Math.abs(x) < pastureWidth / 2 + 1.2 && Math.abs(z - PASTURE.center.z) < pastureDepth / 2 + 1.2) continue
      const f = buildFlower(this.rng.int(0, 4))
      f.position.set(x, 0, z)
      f.rotation.y = this.rng.range(0, Math.PI * 2)
      decor.add(f)
    }

    // Сотни деревьев, камней и цветов сливаются в горсть мешей.
    this.scene.add(mergeStatic(decor))
  }

  #buildClouds() {
    this.clouds = []
    for (let i = 0; i < 7; i++) {
      const cloud = buildCloud(i)
      cloud.position.set(this.rng.range(-40, 40), this.rng.range(15, 24), this.rng.range(-38, -14))
      cloud.userData.speed = this.rng.range(0.25, 0.7)
      this.scene.add(cloud)
      this.clouds.push(cloud)
    }
  }

  // =========================================================================
  //                              Камера
  // =========================================================================

  #setupCameraControls() {
    const canvas = this.canvas
    let dragging = false
    let lastX = 0
    let lastY = 0

    this.dragDistance = 0

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      this.dragDistance = 0
      canvas.setPointerCapture?.(e.pointerId)
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      this.dragDistance += Math.abs(dx) + Math.abs(dy)
      if (this.dragDistance < 7) return
      // Панорамирование: пиксели → мировые единицы через высоту камеры.
      const scale = this.distance * 0.0016
      this.wantTarget.x -= dx * scale
      this.wantTarget.z -= dy * scale
      this.userPanned = true
      this.#clampTarget()
    })

    const stop = (e) => {
      dragging = false
      canvas.releasePointerCapture?.(e.pointerId)
    }
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('pointercancel', stop)
    canvas.addEventListener('pointerleave', () => (dragging = false))

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.#setZoom(this.zoom + Math.sign(e.deltaY) * 0.07)
      },
      { passive: false },
    )

    // Щипок для тачскрина
    let pinchStart = 0
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    })
    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 2 || !pinchStart) return
        e.preventDefault()
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        this.#setZoom(this.zoom * (pinchStart / d))
        pinchStart = d
      },
      { passive: false },
    )
  }

  #setZoom(value) {
    this.zoom = clamp(value, 0.45, 1.3)
    this.wantDistance = this.fitDistance * this.zoom
  }

  #clampTarget() {
    this.wantTarget.x = clamp(this.wantTarget.x, -9, 9)
    this.wantTarget.z = clamp(this.wantTarget.z, -6, 8)
  }

  #applyCamera(k = 1) {
    this.target.lerp(this.wantTarget, k)
    this.distance = this.distance + (this.wantDistance - this.distance) * k
    this.camera.position.copy(this.target).addScaledVector(this.viewDir, this.distance)
    this.camera.lookAt(this.target)
  }

  /** Плавно навести камеру на точку — например, на новую постройку. */
  focus(x, z) {
    this.wantTarget.set(x, 0, z)
    this.#clampTarget()
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    const aspect = w / h
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()

    // Расстояние, при котором ферма влезает в кадр: считаем и по высоте, и по
    // ширине. На вертикальном экране показывать всю ферму бессмысленно — она
    // станет крошечной, поэтому там кадрируем выгон и разрешаем сдвигать вид.
    const portrait = aspect < 0.85
    const tan = Math.tan(((this.camera.fov * Math.PI) / 180) / 2)
    const byHeight = (portrait ? 9 : 12.5) / tan
    const byWidth = (portrait ? 7.8 : 13.5) / (tan * aspect)
    this.fitDistance = clamp(Math.max(byHeight, byWidth), 22, 72)
    this.#setZoom(this.zoom)

    // Пока игрок сам не сдвигал вид, держим выгон в центре свободной области:
    // на телефоне поднимаем его повыше, чтобы не прятался за нижней панелью.
    if (!this.userPanned) {
      this.wantTarget.set(0, 0, portrait ? 2.2 : -0.8)
      this.#clampTarget()
    }
  }

  // =========================================================================
  //                          Обновление декораций
  // =========================================================================

  /** Только камера — нужно на паузе, когда мир заморожен. */
  updateCamera(dt) {
    this.#applyCamera(Math.min(1, dt * 7))
  }

  /**
   * Автоподстройка качества: если кадры стабильно долгие, сначала снижаем
   * разрешение, затем упрощаем и вовсе отключаем тени. Обратно не поднимаем —
   * дёргающееся качество раздражает сильнее низкого.
   */
  adaptQuality(dt) {
    if (this.quality === 0) return
    this.frameTime = this.frameTime === undefined ? dt : this.frameTime * 0.9 + dt * 0.1
    this.qualityTimer = (this.qualityTimer ?? 0) + dt
    if (this.qualityTimer < 3) return
    this.qualityTimer = 0
    if (this.frameTime < 1 / 26) return

    this.quality = (this.quality ?? 2) - 1
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
      this.sun.shadow.mapSize.set(1024, 1024)
    } else {
      this.renderer.shadowMap.enabled = false
      for (const light of [this.sun]) light.castShadow = false
    }
    this.resize()
  }

  update(dt, time) {
    this.#applyCamera(Math.min(1, dt * 7))

    // Колодец: уровень воды и покачивание ведра
    const fill = this.farm.well.water / this.farm.well.max
    this.well.water.position.y = 0.16 + fill * 0.42
    this.well.water.visible = fill > 0.02
    this.well.bucket.position.y = 1.3 + Math.sin(time * 1.2) * 0.05
    this.well.bucket.rotation.z = Math.sin(time * 0.9) * 0.08

    // Грядки
    for (let i = 0; i < this.tileViews.length; i++) {
      const view = this.tileViews[i]
      const tile = this.farm.pasture.tile(i)
      view.soil.material = view.soilMats[tile.state === 'bare' ? 0 : tile.state === 'ready' ? 2 : 1]
      if (tile.state === 'bare') {
        view.grass.visible = false
      } else {
        const g = tile.state === 'ready' ? 1 : Math.max(0.12, tile.growth)
        view.grass.visible = true
        view.grass.scale.set(0.55 + g * 0.45, g, 0.55 + g * 0.45)
        view.grass.rotation.z = Math.sin(time * 1.6 + i) * 0.05 * g
      }
    }

    // Мастерские
    for (const [id, view] of this.factoryViews) {
      const factory = this.farm.factories.get(id)
      view.root.visible = !!factory
      if (!factory) continue
      const working = factory.state === 'working'
      view.gear.rotation.z += dt * (working ? 3.4 : 0.25)
      view.bar.visible = view.barBack.visible = working
      if (working) {
        const p = clamp(factory.progress, 0, 1)
        view.bar.scale.x = Math.max(0.001, p)
        view.bar.position.x = -(1 - p) * (view.bar.userData.width / 2)
      }
      view.smoke.forEach((puff, k) => {
        puff.visible = working
        if (!working) return
        const t = (time * 0.55 + k * 0.25) % 1
        puff.position.y = 3.0 + t * 1.9
        puff.scale.setScalar(0.4 + t * 1.1)
        puff.material.opacity = 0.42 * (1 - t)
      })
      view.icon.rotation.y = time * 0.9
    }

    // Питомник: показываем яйца
    this.nursery.eggSlots.forEach((slot, i) => {
      const egg = this.farm.nursery.eggs[i]
      slot.visible = !!egg
      if (!egg) return
      if (slot.userData.eggId !== egg.id) {
        slot.clear()
        slot.add(buildEggFor(egg))
        slot.userData.eggId = egg.id
      }
      const wobble = Math.sin(time * 5 + i) * 0.06 * (1 - egg.timer / egg.total)
      slot.rotation.z = wobble
      slot.position.y = 0.42 + Math.abs(wobble) * 0.3
    })

    // Клетка
    this.cage.slots.forEach((slot, i) => {
      slot.visible = i < this.farm.cage.count
      if (slot.visible) slot.position.y = 0.3 + Math.abs(Math.sin(time * 2.2 + i)) * 0.06
    })

    // Фургон: рейс на рынок и обратно
    this.#updateTruck(dt, time)

    // Облака
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt
      if (cloud.position.x > 44) cloud.position.x = -44
    }
  }

  #updateTruck(dt, time) {
    const truck = this.farm.truck
    const away = truck.state === 'away'
    const t = truck.tripProgress
    // 0 → 0.5: едем к рынку; 0.5 → 1: возвращаемся.
    const ride = away ? (t <= 0.5 ? t * 2 : (1 - t) * 2) : 0
    const x = SPOTS.truck.x + (SPOTS.market.x - SPOTS.truck.x) * ride
    this.truck.root.position.x = x
    this.truck.root.rotation.y = away && t > 0.5 ? -Math.PI / 2 : Math.PI / 2
    this.truck.chassis.position.y = away ? Math.sin(time * 14) * 0.022 : 0
    const spin = away ? dt * 7 : 0
    for (const wheel of this.truck.wheels) wheel.rotation.z -= spin * (t > 0.5 ? -1 : 1)

    // Груз в кузове
    const cargo = this.truck.cargo
    const key = [...truck.cargo.entries()].map(([id, n]) => `${id}:${n}`).join(',')
    if (cargo.userData.key !== key) {
      cargo.userData.key = key
      cargo.clear()
      let index = 0
      for (const [id, n] of truck.cargo) {
        for (let k = 0; k < n && index < 8; k++, index++) {
          const icon = buildCargoIcon(id)
          icon.position.set(-0.55 + (index % 4) * 0.36, Math.floor(index / 4) * 0.34, -0.28 + ((index % 2) * 0.5))
          icon.scale.setScalar(0.8)
          cargo.add(icon)
        }
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  /** Подсветить грядку под курсором. */
  highlightTile(index) {
    for (let i = 0; i < this.tileViews.length; i++) this.tileViews[i].glow.visible = i === index
  }

  dispose() {
    this.renderer.dispose()
  }
}

function buildEggFor(egg) {
  return buildEgg(egg.hybrid)
}

/** Иконки груза собираются один раз и дальше клонируются. */
const cargoIconCache = new Map()
function buildCargoIcon(itemId) {
  if (!cargoIconCache.has(itemId)) cargoIconCache.set(itemId, buildItemIcon(itemId, 1))
  return cargoIconCache.get(itemId).clone()
}
