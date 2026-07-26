/**
 * Ввод: клавиатура, геймпад и сенсорный экран сводятся к одному набору намерений.
 *
 * Игровая логика не должна знать, откуда пришло «прыгнуть» — иначе каждое
 * новое устройство расползается ветвлениями по всему коду.
 *
 * Клавиши читаются по `event.code`, а не по `event.key`. Это принципиально:
 * при русской раскладке `key` для клавиши W вернёт «ц», и управление отвалится
 * ровно у той аудитории, для которой игра сделана. `code` привязан к
 * физическому положению клавиши и от раскладки не зависит.
 */

const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

const JUMP_KEYS = new Set(['Space'])
const DASH_KEYS = new Set(['ShiftLeft', 'ShiftRight'])
const DOWN_KEYS = new Set(['KeyS', 'ArrowDown'])
const PAUSE_KEYS = new Set(['Escape', 'KeyP'])

/** Мёртвая зона стика: без неё изношенный геймпад уводит героя сам по себе. */
const STICK_DEADZONE = 0.18

export function createInput(target = window) {
  const held = new Set()

  const api = {
    move: { x: 0, y: 0 },
    jumpPressed: false,
    jumpHeld: false,
    dashPressed: false,
    downHeld: false,
    pausePressed: false,
    anyPressed: false,
  }

  // Состояние сенсорного управления и геймпада держим отдельно, а в `move`
  // сводим: иначе отпущенная клавиша обнуляла бы стик и наоборот.
  const touch = { x: 0, y: 0, active: false, jump: false, dash: false }
  let gamepadJumpWasDown = false
  let gamepadDashWasDown = false
  let gamepadPauseWasDown = false

  function onKeyDown(event) {
    if (event.repeat) return
    const code = event.code

    if (JUMP_KEYS.has(code) || DASH_KEYS.has(code) || MOVE_KEYS[code] || PAUSE_KEYS.has(code)) {
      // Пробел и стрелки иначе прокрутят страницу под игрой.
      event.preventDefault()
    }

    held.add(code)
    api.anyPressed = true
    if (JUMP_KEYS.has(code)) api.jumpPressed = true
    if (DASH_KEYS.has(code)) api.dashPressed = true
    if (PAUSE_KEYS.has(code)) api.pausePressed = true
  }

  function onKeyUp(event) {
    held.delete(event.code)
  }

  /**
   * Потеря фокуса окна: все зажатые клавиши считаем отпущенными.
   * Без этого после Alt+Tab герой продолжает бежать в стену, пока игрок
   * не нажмёт и не отпустит ту же клавишу заново.
   */
  function onBlur() {
    held.clear()
    touch.x = 0
    touch.y = 0
    touch.active = false
    touch.jump = false
    touch.dash = false
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  function pollKeyboard() {
    let x = 0
    let y = 0
    for (const code of held) {
      const dir = MOVE_KEYS[code]
      if (dir) {
        x += dir[0]
        y += dir[1]
      }
    }
    return { x, y }
  }

  function pollGamepad() {
    if (!navigator.getGamepads) return null
    const pads = navigator.getGamepads()
    for (const pad of pads) {
      if (!pad || !pad.connected) continue

      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      const x = Math.abs(ax) > STICK_DEADZONE ? ax : 0
      // Ось Y геймпада направлена вниз, а «вперёд» у нас положительное.
      const y = Math.abs(ay) > STICK_DEADZONE ? -ay : 0

      const jump = pad.buttons[0]?.pressed ?? false
      const dash = (pad.buttons[2]?.pressed ?? false) || (pad.buttons[7]?.pressed ?? false)
      const pause = pad.buttons[9]?.pressed ?? false

      // Фронт нажатия ловим сами: у геймпада нет событий, только опрос.
      if (jump && !gamepadJumpWasDown) api.jumpPressed = true
      if (dash && !gamepadDashWasDown) api.dashPressed = true
      if (pause && !gamepadPauseWasDown) api.pausePressed = true
      gamepadJumpWasDown = jump
      gamepadDashWasDown = dash
      gamepadPauseWasDown = pause

      return { x, y, jumpHeld: jump, downHeld: (pad.axes[1] ?? 0) > 0.5 }
    }
    return null
  }

  /** Пересчитывает намерения. Вызывается игрой в начале кадра. */
  function poll() {
    const keys = pollKeyboard()
    const pad = pollGamepad()

    let x = keys.x
    let y = keys.y
    if (pad && (pad.x !== 0 || pad.y !== 0)) {
      x = pad.x
      y = pad.y
    }
    if (touch.active) {
      x = touch.x
      y = touch.y
    }

    // Нормализуем только если вышли за единицу: иначе слабое отклонение стика
    // растянулось бы до максимума и точное движение стало бы невозможным.
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    api.move.x = x
    api.move.y = y

    api.jumpHeld = [...JUMP_KEYS].some((c) => held.has(c)) || (pad?.jumpHeld ?? false) || touch.jump
    api.downHeld = [...DOWN_KEYS].some((c) => held.has(c)) || (pad?.downHeld ?? false) || touch.y < -0.6
    if (touch.jump) api.jumpPressed = true
    if (touch.dash) {
      api.dashPressed = true
      touch.dash = false
    }
  }

  /**
   * Гасим фронты в конце кадра.
   *
   * Отдельные consume-методы существуют, чтобы одно нажатие не сработало
   * дважды: прыжок и рывок читаются один раз тем, кто первым до них добрался.
   */
  function update() {
    api.jumpPressed = false
    api.dashPressed = false
    api.pausePressed = false
    api.anyPressed = false
    touch.jump = false
    poll()
  }

  function consumeJump() {
    if (!api.jumpPressed) return false
    api.jumpPressed = false
    return true
  }

  function consumeDash() {
    if (!api.dashPressed) return false
    api.dashPressed = false
    return true
  }

  function consumePause() {
    if (!api.pausePressed) return false
    api.pausePressed = false
    return true
  }

  // --- Сенсорное управление ---------------------------------------------------

  let touchRoot = null

  /**
   * Виртуальный стик слева и кнопки справа.
   *
   * Стик не нарисован заранее: он появляется там, где палец коснулся экрана.
   * Фиксированный стик на телефоне всегда оказывается не под тем пальцем.
   */
  function attachTouch(container) {
    if (touchRoot) return

    touchRoot = document.createElement('div')
    touchRoot.className = 'touch-controls'
    container.appendChild(touchRoot)

    const stick = document.createElement('div')
    stick.className = 'touch-stick'
    stick.style.display = 'none'
    touchRoot.appendChild(stick)

    const knob = document.createElement('div')
    knob.className = 'touch-knob'
    stick.appendChild(knob)

    const makeButton = (label, className, onPress) => {
      const button = document.createElement('button')
      button.className = `touch-button ${className}`
      button.textContent = label
      button.addEventListener('touchstart', (event) => {
        event.preventDefault()
        onPress(true)
      })
      button.addEventListener('touchend', (event) => {
        event.preventDefault()
        onPress(false)
      })
      touchRoot.appendChild(button)
      return button
    }

    makeButton('▲', 'touch-jump', (down) => {
      touch.jump = down
      if (down) api.jumpPressed = true
    })
    makeButton('»', 'touch-dash', (down) => {
      if (down) touch.dash = true
    })

    let stickId = null
    let originX = 0
    let originY = 0
    const RANGE = 52

    const onTouchStart = (event) => {
      for (const t of event.changedTouches) {
        // Левая половина экрана — стик, правая отдана кнопкам.
        if (stickId === null && t.clientX < window.innerWidth * 0.5) {
          stickId = t.identifier
          originX = t.clientX
          originY = t.clientY
          touch.active = true
          stick.style.display = 'block'
          stick.style.left = `${originX}px`
          stick.style.top = `${originY}px`
          knob.style.transform = 'translate(-50%, -50%)'
        }
      }
    }

    const onTouchMove = (event) => {
      // Без этого страница поедет под пальцем вместе с героем.
      event.preventDefault()
      for (const t of event.changedTouches) {
        if (t.identifier !== stickId) continue
        const dx = t.clientX - originX
        const dy = t.clientY - originY
        const distance = Math.min(Math.hypot(dx, dy), RANGE)
        const angle = Math.atan2(dy, dx)
        const nx = (Math.cos(angle) * distance) / RANGE
        const ny = (Math.sin(angle) * distance) / RANGE
        touch.x = nx
        touch.y = -ny
        knob.style.transform = `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px))`
      }
    }

    const onTouchEnd = (event) => {
      for (const t of event.changedTouches) {
        if (t.identifier !== stickId) continue
        stickId = null
        touch.active = false
        touch.x = 0
        touch.y = 0
        stick.style.display = 'none'
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd, { passive: true })
    container.addEventListener('touchcancel', onTouchEnd, { passive: true })

    touchRoot.userData = { onTouchStart, onTouchMove, onTouchEnd, container }
  }

  function dispose() {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('blur', onBlur)
    if (touchRoot?.userData) {
      const { onTouchStart, onTouchMove, onTouchEnd, container } = touchRoot.userData
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchEnd)
      touchRoot.remove()
      touchRoot = null
    }
  }

  poll()

  return Object.assign(api, {
    consumeJump,
    consumeDash,
    consumePause,
    update,
    attachTouch,
    dispose,
  })
}
