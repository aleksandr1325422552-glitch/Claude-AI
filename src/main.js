import './styles.css'

import { EventBus } from './core/EventBus.js'
import { Sfx } from './core/Sfx.js'
import { loadProgress, resetProgress, saveProgress } from './core/Save.js'
import { clamp } from './core/util.js'

import { ITEMS } from './data/items.js'
import { LEVELS, levelAt, starsFor } from './data/levels.js'
import { computeStats, upgradeCost } from './data/upgrades.js'

import { Farm, PHASE } from './sim/Farm.js'

import { FarmView } from './view/FarmView.js'
import { Fx } from './view/Fx.js'
import { Picker } from './view/Picker.js'
import { World } from './view/World.js'

import { Hud } from './ui/Hud.js'
import { Modal, Panels } from './ui/Panels.js'
import { $, el } from './ui/dom.js'

const STEP = 1 / 60
// На слабой машине лучше слегка замедлить симуляцию, чем прыгать через события.
const MAX_STEPS = 8

/** Собирает симуляцию, сцену и интерфейс в одну игру. */
class Game {
  constructor() {
    this.canvas = $('#scene')
    this.bus = new EventBus()
    this.progress = loadProgress()
    this.sfx = new Sfx(this.progress.soundOn)

    this.fxLayer = el('div', { id: 'fxlayer' })
    document.getElementById('app').append(this.fxLayer)

    this.modal = new Modal()
    this.panels = new Panels({ modal: this.modal, actions: this.#actions() })

    this.userPaused = false
    this.levelIndex = clamp(this.progress.levelIndex, 0, LEVELS.length - 1)
    this.accumulator = 0
    this.time = 0
    this.lastFrame = 0

    this.#buildLevel(this.levelIndex)
    this.world = new World(this.canvas, this.farm)
    this.farmView = new FarmView(this.world.scene, this.farm)
    this.fx = new Fx(this.world.scene, this.world.camera, this.canvas, this.fxLayer)
    this.hud = new Hud(this.farm, this.#actions())
    this.panels.bind(this.farm, this.progress)

    // Живые объекты проверяются первыми — иначе постройка «съедает» клик по
    // существу или товару, оказавшемуся рядом с ней.
    this.picker = new Picker(this.canvas, this.world.camera, () => [this.farmView.pickTargets, this.world.pickTargets], {
      onClick: (hit) => this.#onClick(hit),
      onHover: (hit, x, y) => this.#onHover(hit, x, y),
    })

    this.#wireEvents()
    this.#wireButtons()
    this.#wireKeyboard()

    window.addEventListener('resize', () => this.world.resize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.lastFrame = 0
    })

    $('#loading').classList.add('is-hidden')
    setTimeout(() => $('#loading').remove(), 600)

    requestAnimationFrame((t) => this.#frame(t))

    // Первый уровень открывается брифингом; справку показываем один раз.
    if (!this.progress.seenHelp) {
      this.progress.seenHelp = true
      saveProgress(this.progress)
      this.panels.help()
      this.modal.onClose = () => this.#showIntro()
    } else {
      this.#showIntro()
    }
  }

  // =========================================================================
  //                          Уровни и прогресс
  // =========================================================================

  #buildLevel(index) {
    this.levelIndex = index
    this.level = levelAt(index)
    this.stats = computeStats(this.progress.upgrades)
    this.bus.clear()
    this.farm = new Farm({ level: this.level, stats: this.stats, coins: this.progress.coins, bus: this.bus })
    this.levelOver = false
  }

  #showIntro() {
    this.panels.levelIntro(this.level, this.levelIndex, this.progress.stars[this.level.id] ?? 0, () => {
      this.sfx.unlock()
      this.hud.toast(`${this.level.name} — вперёд!`, 'good')
    })
  }

  /** Пересоздаёт уровень, переиспользуя уже собранную сцену. */
  #restartLevel(index) {
    this.#buildLevel(index)
    this.world.setFarm(this.farm)
    this.farmView.setFarm(this.farm)
    this.hud.setFarm(this.farm)
    this.panels.bind(this.farm, this.progress)
    this.fx.clearTexts()
    this.#wireEvents()
    this.#showIntro()
  }

  #endLevel(phase) {
    if (this.levelOver) return
    this.levelOver = true
    const won = phase === PHASE.WON
    const isLast = this.levelIndex >= LEVELS.length - 1

    if (won) {
      const stars = starsFor(this.level, this.farm.usedFraction)
      this.progress.coins = Math.floor(this.farm.coins)
      this.progress.stars[this.level.id] = Math.max(this.progress.stars[this.level.id] ?? 0, stars)
      this.progress.levelIndex = Math.min(this.levelIndex + 1, LEVELS.length)
      saveProgress(this.progress)
    }

    const goNext = () => {
      if (isLast) {
        this.panels.campaignEnd(this.progress, () => {
          this.progress = resetProgress()
          this.progress.seenHelp = true
          saveProgress(this.progress)
          this.#restartLevel(0)
        })
      } else {
        this.#restartLevel(this.levelIndex + 1)
      }
    }

    this.panels.levelResult(
      { won, farm: this.farm, level: this.level, isLast },
      {
        onShop: () => this.panels.shop(goNext),
        onNext: goNext,
        onRetry: () => this.#restartLevel(this.levelIndex),
      },
    )
  }

  // =========================================================================
  //                                События
  // =========================================================================

  #wireEvents() {
    this.bus.on('toast', ({ text, kind }) => this.hud.toast(text, kind))
    this.bus.on('sfx', (name) => this.sfx.play(name))
    this.bus.on('phase', ({ phase }) => this.#endLevel(phase))
    this.bus.on('coins', ({ delta, x, z }) => {
      if (delta > 0 && x !== undefined) this.fx.text(x, 1.6, z, `+${delta} 🪙`, 'fxtext--gold')
    })
    this.bus.on('fx', (e) => this.#playFx(e))
  }

  #playFx(e) {
    const fx = this.fx
    switch (e.type) {
      case 'water':
        fx.burst(e.x, e.z, { color: 0x63c7f0, count: 12, speed: 2.6, y: 1.3 })
        break
      case 'plant':
        fx.burst(e.x, e.z, { color: 0x6fd85a, count: 10, speed: 2.2, y: 0.35 })
        fx.ring(e.x, e.z, { color: 0x8ff07a, to: 1.4 })
        break
      case 'drop':
        fx.ring(e.x, e.z, { color: 0xffe08a, to: 1.1, life: 0.4 })
        break
      case 'collect': {
        const color = ITEMS[e.itemId]?.color ?? 0xffffff
        fx.burst(e.x, e.z, { color, count: 12, speed: 3.2, y: 0.5, life: 0.55 })
        fx.text(e.x, 1.0, e.z, `${ITEMS[e.itemId].emoji}`, 'fxtext--item')
        break
      }
      case 'eat':
        fx.burst(e.x, e.z, { color: 0x6fd85a, count: 5, speed: 1.5, y: 0.35, size: 0.7, life: 0.45 })
        break
      case 'grow':
        fx.ring(e.x, e.z, { color: 0xffd85e, to: 2.4 })
        fx.burst(e.x, e.z, { color: 0xffe9a8, count: 16, speed: 3.4, y: 0.8 })
        break
      case 'hatch':
        fx.ring(e.x, e.z, { color: 0xd7a3ff, to: 2.6 })
        fx.burst(e.x, e.z, { color: 0xe8d6ff, count: 18, speed: 3.6, y: 0.9 })
        break
      case 'poof':
        fx.burst(e.x, e.z, { color: 0xbfb4c8, count: 12, speed: 2.4, y: 0.6, life: 0.6 })
        break
      case 'hit':
        fx.burst(e.x, e.z, { color: 0xff6b52, count: 10, speed: 3.6, y: 0.7, life: 0.4 })
        fx.ring(e.x, e.z, { color: 0xff8f77, to: 1.3, life: 0.3 })
        break
      case 'trample':
        fx.burst(e.x, e.z, { color: 0x9c7b52, count: 8, speed: 2.2, y: 0.3 })
        break
      case 'cage':
        fx.ring(e.x, e.z, { color: 0x8b5cf6, to: 2.6 })
        break
      case 'pet':
        fx.burst(e.x, e.z, { color: 0xff9dc2, count: 6, speed: 1.6, y: 1.2, size: 0.8, gravity: -2 })
        break
      case 'factory':
        fx.burst(e.x, e.z + 1.2, { color: 0xffffff, count: 6, speed: 1.6, y: 2.6, gravity: -1.5 })
        break
      default:
        break
    }
  }

  // =========================================================================
  //                            Действия игрока
  // =========================================================================

  #actions() {
    const farm = () => this.farm
    return {
      loadTruck: (id) => farm().loadTruck(id),
      unloadTruck: (id) => farm().unloadTruck(id),
      sendTruck: () => farm().sendTruck(),
      sellCage: () => farm().sellCage(),
      buyEgg: (id) => farm().buyEgg(id),
      buyAdult: (id) => farm().buyAdult(id),
      buyFactory: (id) => farm().buyFactory(id),
      sellCreature: (id) => farm().sellCreature(id),
      breed: (a, b) => farm().breed(a, b),
      buyUpgrade: (id) => this.#buyUpgrade(id),
    }
  }

  #buyUpgrade(id) {
    const owned = this.progress.upgrades[id] ?? 0
    const cost = upgradeCost(id, owned)
    if (cost === null || this.progress.coins < cost) {
      this.sfx.play('error')
      return false
    }
    this.progress.coins -= cost
    this.progress.upgrades[id] = owned + 1
    saveProgress(this.progress)
    this.sfx.play('upgrade')
    return true
  }

  #onClick(hit) {
    this.sfx.unlock()
    if (!hit || this.levelOver || this.#isPaused()) return
    const farm = this.farm

    switch (hit.kind) {
      case 'well':
        farm.drawWater()
        break
      case 'tile':
        farm.waterTile(hit.index)
        break
      case 'drop':
        farm.collectDrop(hit.id)
        break
      case 'creature':
        farm.pet(hit.id)
        break
      case 'raider':
        farm.hitRaider(hit.id)
        break
      case 'cage':
        farm.sellCage()
        break
      case 'nursery':
        this.panels.nursery()
        break
      case 'truck':
        farm.sendTruck()
        break
      case 'warehouse':
        this.hud.toast(`Склад: ${farm.warehouse.count}/${farm.warehouse.capacity}`, farm.warehouse.isFull ? 'bad' : '')
        break
      case 'factory': {
        const factory = farm.factories.get(hit.id)
        if (!factory) break
        // Начатую партию мастерская всё равно докрутит до конца.
        factory.enabled = !factory.enabled
        this.hud.toast(`${factory.def.name}: ${factory.enabled ? 'работает' : 'остановлена'}`)
        this.sfx.play('ui')
        break
      }
      default:
        break
    }
  }

  #onHover(hit, x, y) {
    this.world.highlightTile(hit?.kind === 'tile' ? hit.index : -1)
    if (!hit || this.#isPaused()) {
      this.hud.hideTooltip()
      this.canvas.style.cursor = 'default'
      return
    }
    const html = this.hud.tooltipFor(hit)
    if (html) this.hud.showTooltip(html, x, y)
    else this.hud.hideTooltip()
    this.canvas.style.cursor = 'pointer'
  }

  // =========================================================================
  //                          Кнопки и клавиатура
  // =========================================================================

  #wireButtons() {
    $('#btn-help').addEventListener('click', () => this.panels.help())
    $('#btn-market').addEventListener('click', () => this.panels.market())
    $('#btn-nursery').addEventListener('click', () => this.panels.nursery())
    $('#btn-roster').addEventListener('click', () => this.panels.roster())
    $('#btn-pause').addEventListener('click', () => this.#togglePause())

    const soundBtn = $('#btn-sound')
    const refreshSound = () => {
      soundBtn.textContent = this.progress.soundOn ? '🔊' : '🔇'
      soundBtn.classList.toggle('is-off', !this.progress.soundOn)
    }
    soundBtn.addEventListener('click', () => {
      this.progress.soundOn = !this.progress.soundOn
      this.sfx.setEnabled(this.progress.soundOn)
      if (this.progress.soundOn) this.sfx.unlock()
      saveProgress(this.progress)
      refreshSound()
    })
    refreshSound()

    this.canvas.addEventListener('pointerdown', () => this.sfx.unlock(), { once: true })
  }

  #wireKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          this.#togglePause()
          break
        case 'escape':
          if (!this.modal.isOpen) this.#togglePause()
          break
        case 'm':
          $('#btn-sound').click()
          break
        case 'h':
          if (!this.modal.isOpen) this.panels.help()
          break
        case 'e':
          if (!this.#isPaused()) this.farm.sendTruck()
          break
        case 'q':
          if (!this.#isPaused()) this.farm.drawWater()
          break
        case 'w': {
          if (this.#isPaused()) break
          // Поливает первую подходящую грядку — для быстрой игры с клавиатуры.
          const tile = this.farm.pasture.tiles.find((t) => t.state === 'bare')
          if (tile) this.farm.waterTile(tile.index)
          break
        }
        case 'r':
          if (!this.modal.isOpen) this.panels.roster()
          break
        case 'b':
          if (!this.modal.isOpen) this.panels.market()
          break
        case 'n':
          if (!this.modal.isOpen) this.panels.nursery()
          break
        default:
          break
      }
    })
  }

  #togglePause() {
    if (this.levelOver) return
    if (this.modal.isOpen) {
      this.modal.close()
      return
    }
    this.panels.pause({
      onResume: () => {},
      onHelp: () => this.panels.help(),
      onRestart: () => {
        this.modal.close()
        this.#restartLevel(this.levelIndex)
      },
      onQuit: () => {
        this.modal.close()
        this.farm.giveUp()
      },
    })
  }

  #isPaused() {
    return this.modal.isOpen || this.userPaused || document.hidden
  }

  // =========================================================================
  //                              Игровой цикл
  // =========================================================================

  #frame(now) {
    requestAnimationFrame((t) => this.#frame(t))

    if (!this.lastFrame) this.lastFrame = now
    const raw = (now - this.lastFrame) / 1000
    this.lastFrame = now
    const dt = Math.min(raw, 0.25)

    const paused = this.#isPaused()
    this.picker.setEnabled(!paused)

    if (!paused) {
      this.time += dt
      this.accumulator += dt
      let steps = 0
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        this.farm.update(STEP)
        this.accumulator -= STEP
        steps++
      }
      if (steps === MAX_STEPS) this.accumulator = 0

      this.world.adaptQuality(dt)
      this.world.update(dt, this.time)
      this.farmView.update(dt, this.time)
      this.fx.update(dt)
      this.picker.updateHover()
      this.hud.update()
    } else {
      // На паузе всё замирает, но камера продолжает плавно догонять цель.
      this.world.updateCamera(dt)
    }

    this.world.render()
  }
}

// Точка входа: ловим ошибки, чтобы вместо чёрного экрана показать сообщение.
try {
  window.game = new Game()
} catch (error) {
  console.error(error)
  const loading = $('#loading')
  if (loading) {
    loading.innerHTML = `<div class="loading__inner"><p>Не удалось запустить игру.</p><p style="font-size:14px;opacity:.8">${String(
      error,
    )}</p></div>`
  }
}
