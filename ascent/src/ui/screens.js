import { formatHeight, formatScore } from '../core/util.js'

/**
 * Полноэкранные окна: меню, пауза, итог забега.
 *
 * Каждое возвращает промис с решением игрока. Обработчики снимаются при
 * скрытии окна — иначе после нескольких забегов на одной кнопке накапливались
 * бы дубликаты и одно нажатие срабатывало бы по многу раз.
 */

export function createScreens(container, deps = {}) {
  const { audio } = deps

  const root = document.createElement('div')
  root.className = 'screen screen--hidden'
  container.appendChild(root)

  /** Активные отписки текущего окна. */
  let cleanups = []

  function clearHandlers() {
    for (const off of cleanups) off()
    cleanups = []
  }

  /** Вешает обработчик и сразу запоминает, как его снять. */
  function on(node, event, handler) {
    node.addEventListener(event, handler)
    cleanups.push(() => node.removeEventListener(event, handler))
  }

  function hide() {
    clearHandlers()
    root.classList.add('screen--hidden')
    root.innerHTML = ''
  }

  function show(html) {
    clearHandlers()
    root.innerHTML = html
    root.classList.remove('screen--hidden')
  }

  /** Подписывает кнопки окна на разрешение промиса их значением data-action. */
  function wireButtons(resolve) {
    for (const button of root.querySelectorAll('[data-action]')) {
      on(button, 'click', () => {
        audio?.play('menu')
        resolve(button.dataset.action)
      })
      on(button, 'pointerenter', () => audio?.play('menu'))
    }
  }

  /**
   * Главное меню.
   * @returns {Promise<{action: string}>}
   */
  function showMenu(save) {
    return new Promise((resolve) => {
      const best = save?.best ?? 0
      const bestHeight = save?.bestHeight ?? 0

      show(`
        <div class="panel panel--menu">
          <h1 class="title">ВВЫСЬ</h1>
          <p class="subtitle">Башня бесконечна. Пустота — тоже.</p>

          ${
            best > 0
              ? `<div class="record">
                   <span>Рекорд <b>${formatScore(best)}</b></span>
                   <span>Высота <b>${formatHeight(bestHeight)}</b></span>
                 </div>`
              : ''
          }

          <button class="button button--primary" data-action="start">Начать подъём</button>

          <div class="controls">
            <div class="controls-row"><kbd>WASD</kbd><span>движение</span></div>
            <div class="controls-row"><kbd>Пробел</kbd><span>прыжок, дважды — двойной</span></div>
            <div class="controls-row"><kbd>Shift</kbd><span>рывок: неуязвим и сбивает врагов</span></div>
            <div class="controls-row"><kbd>Esc</kbd><span>пауза</span></div>
          </div>

          <p class="hint">Двойной прыжок и рывок тратят стамину. Стоя на месте, её не восстановить —
          пустота поднимается быстрее, чем кажется.</p>
        </div>
      `)

      wireButtons((action) => resolve({ action }))

      // Пробел и Enter запускают забег: тянуться к мыши на старте незачем.
      const onKey = (event) => {
        if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
          event.preventDefault()
          resolve({ action: 'start' })
        }
      }
      window.addEventListener('keydown', onKey)
      cleanups.push(() => window.removeEventListener('keydown', onKey))
    })
  }

  /** @returns {Promise<'resume'|'restart'|'menu'>} */
  function showPause() {
    return new Promise((resolve) => {
      show(`
        <div class="panel">
          <h2 class="panel-title">Пауза</h2>
          <button class="button button--primary" data-action="resume">Продолжить</button>
          <button class="button" data-action="restart">Начать заново</button>
          <button class="button button--ghost" data-action="menu">В меню</button>
        </div>
      `)
      wireButtons(resolve)

      const onKey = (event) => {
        if (event.code === 'Escape') {
          event.preventDefault()
          resolve('resume')
        }
      }
      window.addEventListener('keydown', onKey)
      cleanups.push(() => window.removeEventListener('keydown', onKey))
    })
  }

  /** @returns {Promise<'restart'|'menu'>} */
  function showDeath(result) {
    return new Promise((resolve) => {
      show(`
        <div class="panel panel--death">
          ${result.isRecord ? '<div class="badge">Новый рекорд</div>' : ''}
          <h2 class="panel-title">Подъём окончен</h2>

          <div class="stats">
            <div class="stat">
              <span class="stat-value">${formatHeight(result.height)}</span>
              <span class="stat-label">высота</span>
            </div>
            <div class="stat">
              <span class="stat-value">${formatScore(result.score)}</span>
              <span class="stat-label">очки</span>
            </div>
            <div class="stat">
              <span class="stat-value">${result.crystals}</span>
              <span class="stat-label">кристаллы</span>
            </div>
          </div>

          <p class="reached">Дальше всего забрался: <b>${result.biome}</b></p>
          ${!result.isRecord && result.best ? `<p class="hint">Рекорд — ${formatScore(result.best)}</p>` : ''}

          <button class="button button--primary" data-action="restart">Ещё раз</button>
          <button class="button button--ghost" data-action="menu">В меню</button>
        </div>
      `)
      wireButtons(resolve)

      // Пауза перед приёмом клавиши: без неё прыжок, зажатый в момент гибели,
      // мгновенно перезапускает забег, и игрок не успевает увидеть результат.
      const armAt = performance.now() + 700
      const onKey = (event) => {
        if (performance.now() < armAt) return
        if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
          event.preventDefault()
          resolve('restart')
        }
      }
      window.addEventListener('keydown', onKey)
      cleanups.push(() => window.removeEventListener('keydown', onKey))
    })
  }

  function dispose() {
    clearHandlers()
    root.remove()
  }

  return { showMenu, showPause, showDeath, hide, dispose }
}
