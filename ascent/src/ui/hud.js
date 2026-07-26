import { formatHeight, formatScore } from '../core/util.js'
import { PLAYER } from '../game/config.js'

/**
 * Игровой интерфейс поверх сцены.
 *
 * Главный принцип — DOM трогаем только когда значение действительно
 * изменилось. Интерфейс обновляется шестьдесят раз в секунду, и переписывать
 * textContent на каждом кадре значит заставлять браузер пересчитывать вёрстку
 * там, где ничего не поменялось.
 */

export function createHud(container) {
  const root = document.createElement('div')
  root.className = 'hud'
  container.appendChild(root)

  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-height">
        <span class="hud-height-value">0 м</span>
        <span class="hud-height-best">рекорд 0 м</span>
      </div>
      <div class="hud-biome"></div>
      <div class="hud-score">
        <span class="hud-score-value">0</span>
        <span class="hud-multiplier"></span>
      </div>
    </div>

    <div class="hud-warning">Пустота близко</div>

    <div class="hud-bottom">
      <div class="hud-hearts"></div>
      <div class="hud-stamina"><div class="hud-stamina-fill"></div></div>
    </div>

    <div class="hud-toasts"></div>
  `

  const heightValue = root.querySelector('.hud-height-value')
  const heightBest = root.querySelector('.hud-height-best')
  const biome = root.querySelector('.hud-biome')
  const scoreValue = root.querySelector('.hud-score-value')
  const multiplier = root.querySelector('.hud-multiplier')
  const warning = root.querySelector('.hud-warning')
  const hearts = root.querySelector('.hud-hearts')
  const staminaFill = root.querySelector('.hud-stamina-fill')
  const toasts = root.querySelector('.hud-toasts')

  // Сердца создаём один раз, дальше только переключаем класс.
  const heartNodes = []
  for (let i = 0; i < PLAYER.maxHealth; i++) {
    const heart = document.createElement('div')
    heart.className = 'hud-heart'
    hearts.appendChild(heart)
    heartNodes.push(heart)
  }

  // Предыдущие значения — по ним и решаем, трогать ли DOM.
  const previous = {
    height: -1,
    best: -1,
    score: -1,
    multiplier: -1,
    health: -1,
    stamina: -1,
    danger: -1,
    biome: '',
    visible: null,
  }

  function update(state) {
    if (state.visible !== previous.visible) {
      root.classList.toggle('hud--hidden', !state.visible)
      previous.visible = state.visible
    }
    if (!state.visible) return

    // Высоту округляем до метра: дробные доли рябят и читать их невозможно.
    const height = Math.floor(state.height)
    if (height !== previous.height) {
      heightValue.textContent = formatHeight(height)
      previous.height = height
    }

    const best = Math.floor(state.best ?? 0)
    if (best !== previous.best) {
      heightBest.textContent = `рекорд ${formatScore(best)}`
      previous.best = best
    }

    if (state.score !== previous.score) {
      scoreValue.textContent = formatScore(state.score)
      previous.score = state.score
    }

    const mult = Math.round(state.multiplier * 100) / 100
    if (mult !== previous.multiplier) {
      // Множитель показываем только когда он что-то даёт.
      multiplier.textContent = mult > 1.01 ? `×${mult.toFixed(2)}` : ''
      previous.multiplier = mult
    }

    if (state.health !== previous.health) {
      heartNodes.forEach((node, i) => node.classList.toggle('hud-heart--empty', i >= state.health))
      previous.health = state.health
    }

    const stamina = Math.round(state.stamina)
    if (stamina !== previous.stamina) {
      staminaFill.style.width = `${stamina}%`
      staminaFill.classList.toggle('hud-stamina-fill--low', stamina < 25)
      previous.stamina = stamina
    }

    // Порог 0.5 — то расстояние, с которого ещё можно что-то предпринять.
    const alarmed = state.danger > 0.5
    if (alarmed !== previous.danger > 0.5) {
      warning.classList.toggle('hud-warning--on', alarmed)
    }
    if (alarmed) {
      // Пульсация ускоряется по мере приближения — тревога нарастает.
      warning.style.animationDuration = `${1.1 - state.danger * 0.7}s`
    }
    previous.danger = state.danger

    if (state.biomeName !== previous.biome) {
      biome.textContent = state.biomeName
      previous.biome = state.biomeName
    }
  }

  /** Всплывающее сообщение: чекпойнт, смена пояса, подсказка. */
  function showToast(text, kind = 'info') {
    const toast = document.createElement('div')
    toast.className = `hud-toast hud-toast--${kind}`
    toast.textContent = text
    toasts.appendChild(toast)
    // Убираем по окончании анимации, а не по таймеру: так узел живёт ровно
    // столько, сколько его видно, даже если вкладка подтормаживала.
    toast.addEventListener('animationend', () => toast.remove(), { once: true })
  }

  function dispose() {
    root.remove()
  }

  return { update, showToast, dispose }
}
