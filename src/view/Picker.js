import * as THREE from 'three'

const CLICK_SLOP = 8 // пикселей — дальше это уже перетаскивание камеры

/**
 * Превращает движения мыши/пальца в игровые клики по объектам сцены.
 *
 * `getTargets()` возвращает несколько групп целей в порядке приоритета:
 * сначала живые объекты (существа, товар, твари), потом постройки и грядки.
 * Иначе крупная невидимая «кнопка» постройки перехватывала бы клики по тому,
 * что стоит прямо за ней.
 */
export class Picker {
  constructor(canvas, camera, getTargets, { onClick, onHover }) {
    this.canvas = canvas
    this.camera = camera
    this.getTargets = getTargets
    this.onClick = onClick
    this.onHover = onHover

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.hovered = null
    this.enabled = true

    this.downX = 0
    this.downY = 0
    this.moved = 0
    this.pressed = false
    // Пока указатель ни разу не двигался, его положение неизвестно —
    // подсказку показывать некуда.
    this.lastClientX = null
    this.lastClientY = null

    canvas.addEventListener('pointerdown', (e) => {
      this.pressed = true
      this.downX = e.clientX
      this.downY = e.clientY
      this.moved = 0
    })

    canvas.addEventListener('pointermove', (e) => {
      if (this.pressed) this.moved = Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY)
      this.#setPointer(e.clientX, e.clientY)
      this.hoverDirty = true
    })

    canvas.addEventListener('pointerup', (e) => {
      const wasClick = this.pressed && this.moved < CLICK_SLOP
      this.pressed = false
      if (!wasClick || !this.enabled) return
      this.#setPointer(e.clientX, e.clientY)
      const hit = this.pick()
      this.onClick?.(hit, e)
    })

    canvas.addEventListener('pointerleave', () => {
      this.pressed = false
      this.hovered = null
      this.onHover?.(null)
    })
  }

  #setPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.lastClientX = clientX
    this.lastClientY = clientY
  }

  /** Ближайший объект под курсором с игровыми данными. */
  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    for (const group of this.getTargets()) {
      if (!group.length) continue
      const hits = this.raycaster.intersectObjects(group, false)
      for (const hit of hits) {
        if (!isVisible(hit.object)) continue
        const data = hit.object.userData
        if (data && data.kind) return { ...data, point: hit.point, distance: hit.distance, object: hit.object }
      }
    }
    return null
  }

  /** Пересчёт наведения — вызывается из игрового цикла, не на каждое событие. */
  updateHover() {
    if (!this.hoverDirty || !this.enabled || this.lastClientX === null) return
    this.hoverDirty = false
    const hit = this.pick()
    const key = hit ? `${hit.kind}:${hit.id ?? hit.index ?? ''}` : null
    if (key === this.hoveredKey) return
    this.hoveredKey = key
    this.hovered = hit
    this.onHover?.(hit, this.lastClientX, this.lastClientY)
  }

  setEnabled(on) {
    if (this.enabled === on) return
    this.enabled = on
    this.hovered = null
    this.hoveredKey = null
    this.hoverDirty = on && this.lastClientX !== null
    if (!on) this.onHover?.(null)
  }
}

/** Луч не должен попадать в скрытые объекты (например, ненужные мастерские). */
function isVisible(object) {
  let node = object
  while (node) {
    if (node.visible === false) return false
    node = node.parent
  }
  return true
}
