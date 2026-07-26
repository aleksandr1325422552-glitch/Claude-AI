import './ui/styles.css'
import * as THREE from 'three'
import { createRenderer, detectQuality } from './render/renderer.js'
import { createCameraRig } from './render/camera.js'
import { createFx } from './render/fx.js'
import { createEvents } from './core/events.js'
import { createInput } from './core/input.js'
import { createAudio } from './core/audio.js'
import { createSave } from './core/save.js'
import { createCollisionWorld } from './world/collision.js'
import { createTower } from './world/generator.js'
import { createPlayer } from './game/player.js'
import { createEnemies } from './game/enemies.js'
import { createPickups } from './game/pickups.js'
import { createHazard } from './game/hazard.js'
import { createHud } from './ui/hud.js'
import { createScreens } from './ui/screens.js'
import { PLAYER, SCORE } from './game/config.js'
import { clamp01 } from './core/util.js'

/**
 * Точка входа.
 *
 * Игра запускается не сразу: сначала проверяется, что браузер вообще умеет
 * трёхмерную графику. Без этой проверки отказ WebGL роняет модуль целиком —
 * вместе с кодом, который должен показать об этом сообщение, — и от игры
 * остаётся чёрный прямоугольник без единого намёка на причину.
 *
 * Проверка и запуск живут в одном модуле сознательно. Напрашивается вынести
 * игру отдельно и подгружать её динамическим импортом, но сборщик выделяет под
 * такой импорт отдельный файл, а игра обязана оставаться одним самодостаточным
 * документом без единого внешнего запроса.
 */

const container = document.getElementById('app')

/**
 * Задаёт игровому полю высоту в пикселях по высоте окна.
 *
 * Оконные единицы в CSS здесь не годятся: внутри кадра, чья высота выводится
 * из высоты содержимого, `100svh` разрешается в высоту самого кадра — петля,
 * которая застывает на том значении, с которого кадр начал. Прочитанное число
 * пикселей эту петлю размыкает: высота кадра сходится к высоте окна и дальше
 * не двигается.
 */
function fitToWindow() {
  const height = Math.max(window.innerHeight || 0, 480)
  container.style.height = `${height}px`
}

/**
 * Показывает причину, по которой игра не запустилась.
 *
 * Текст подбирается под настоящую причину, а не под самую вероятную. Первая
 * версия этого экрана всегда винила WebGL — и, когда игра упала совсем по
 * другому поводу, увела расследование в сторону. Догадка, поданная как
 * диагноз, хуже отсутствия диагноза.
 *
 * @param {'webgl'|'startup'} reason
 * @param {string} [detail] Текст исходной ошибки — он и есть самое ценное.
 */
function showFatal(reason, detail) {
  container.innerHTML = ''

  const box = document.createElement('div')
  box.className = 'fatal'

  const heading = document.createElement('h2')
  heading.textContent = 'Игра не запустилась'

  const text = document.createElement('p')
  text.textContent =
    reason === 'webgl'
      ? 'Браузер не смог включить трёхмерную графику (WebGL). Так бывает при ' +
        'отключённом аппаратном ускорении, на очень старом браузере или во ' +
        'встроенном окне с ограничениями. Попробуйте открыть страницу в ' +
        'отдельной вкладке.'
      : 'Что-то помешало запуску — текст ошибки ниже. Если страница открыта во ' +
        'встроенном окне, попробуйте открыть её в отдельной вкладке.'

  box.append(heading, text)

  if (detail) {
    const code = document.createElement('code')
    code.textContent = detail
    box.append(code)
  }

  container.append(box)
}

/**
 * Проверяет WebGL до запуска игры.
 *
 * Пробный контекст сразу освобождаем: число одновременных контекстов у
 * браузера ограничено, и забытый пробник может стоить игре её собственного.
 */
function webglSupported() {
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') || probe.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

fitToWindow()
window.addEventListener('resize', fitToWindow)

if (!webglSupported()) {
  showFatal('webgl', 'WebGL недоступен')
} else {
  try {
    start()
  } catch (error) {
    showFatal('startup', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    throw error
  }
}

/** Создаёт все системы игры и запускает игровой цикл. */
function start() {
  const save = createSave()
  const qualityName = save.settings.quality ?? detectQuality()

  const view = createRenderer(container, qualityName)
  const cameraRig = createCameraRig(view.camera)
  const fx = createFx(view.scene)
  const events = createEvents()
  const input = createInput(window)
  const audio = createAudio()
  const hud = createHud(container)
  const screens = createScreens(container, { save })

  audio.setMuted(save.settings.muted ?? false)
  audio.setMusic(save.settings.music ?? true)

  const collision = createCollisionWorld()
  const tower = createTower(view.scene, collision, { seed: 'ввысь' })
  // Башня строится вперёд по высоте, поэтому красить её надо палитрой той
  // высоты, где сегмент окажется. Ссылку на состояние палитры отдаём сразу.
  tower.prime(view.palette.state)
  const player = createPlayer(view.scene, { fx, audio, camera: cameraRig })
  const enemies = createEnemies(view.scene)
  const pickups = createPickups(view.scene)
  const hazard = createHazard(view.scene)

  if ('ontouchstart' in window) input.attachTouch(container)

  /**
   * Фасад мира, который получают игрок, враги и пикапы.
   *
   * Собран один раз и обновляется на месте: пересобирать объект каждый кадр —
   * значит выбрасывать мусор шестьдесят раз в секунду.
   */
  const world = {
    collision,
    tower,
    hazardY: 0,
    fx,
    audio,
    events,
    palette: view.palette.state,
  }

  /** Состояние забега. Всё, что обнуляется при рестарте, живёт здесь. */
  const run = {
    state: 'menu', // 'menu' | 'playing' | 'paused' | 'dead'
    score: 0,
    crystals: 0,
    multiplier: 1,
    checkpointsReached: 0,
    time: 0,
    /** Высота, за которую уже начислены очки, — чтобы не платить дважды. */
    paidHeight: 0,
  }

  // --- Реакция на игровые события ---------------------------------------------

  events.on('crystal', () => {
    run.crystals++
    run.score += SCORE.crystal * run.multiplier
  })

  events.on('checkpoint', ({ position }) => {
    run.checkpointsReached++
    run.score += SCORE.checkpoint * run.multiplier
    run.multiplier = Math.min(SCORE.maxStreakMultiplier, run.multiplier + SCORE.streakStep)
    hud.showToast('Контрольная точка', 'good')
    fx.pillar(position, view.palette.state.accent.getHex())
    audio.play('checkpoint')
  })

  events.on('damage', () => {
    // Серия обрывается: множитель — награда за чистый подъём, а не за время.
    run.multiplier = 1
    cameraRig.addShake(0.7)
  })

  events.on('biome', ({ name }) => hud.showToast(name, 'biome'))

  // --- Забег -------------------------------------------------------------------

  function startRun() {
    collision.clear()
    tower.reset('ввысь-' + Math.floor(Math.random() * 1e9))
    enemies.clear()
    pickups.clear()

    const start = tower.startPoint
    player.respawn(start)
    hazard.reset(start.y)
    cameraRig.snap(player.position, 0)

    run.state = 'playing'
    run.score = 0
    run.crystals = 0
    run.multiplier = 1
    run.checkpointsReached = 0
    run.time = 0
    run.paidHeight = 0

    screens.hide()
    audio.play('start')
  }

  function endRun() {
    run.state = 'dead'
    audio.play('die')
    cameraRig.addShake(1.2)

    const height = player.state.maxHeight
    const isRecord = save.submit(run.score, height)

    screens
      .showDeath({
        height,
        score: Math.floor(run.score),
        crystals: run.crystals,
        isRecord,
        best: save.best,
        biome: view.palette.state.name,
      })
      .then((action) => {
        if (action === 'restart') startRun()
        else openMenu()
      })
  }

  function openMenu() {
    run.state = 'menu'
    screens.showMenu(save).then(() => startRun())
  }

  function togglePause() {
    if (run.state === 'playing') {
      run.state = 'paused'
      screens.showPause().then((action) => {
        if (action === 'resume') {
          run.state = 'playing'
          screens.hide()
        } else if (action === 'restart') startRun()
        else openMenu()
      })
    }
  }

  // --- Игровой цикл ------------------------------------------------------------

  /**
   * Физику считаем фиксированным шагом, а картинку рисуем как получится.
   *
   * При переменном шаге прыжок на слабом железе получается другой высоты, чем на
   * быстром, — платформер с такой физикой нечестен. Число подшагов ограничено:
   * после сворачивания вкладки накопленное время может быть огромным, и без
   * ограничения игра «догоняла» бы его секундами фриза.
   */
  const FIXED_STEP = 1 / 60
  const MAX_STEPS = 5

  let accumulator = 0
  let lastTime = performance.now()
  let fps = 60

  const focusPoint = new THREE.Vector3()

  /**
   * Разбирает очередь появления, накопленную генератором.
   *
   * Генератор не создаёт врагов и пикапы сам — он только помечает места. Так
   * мир и его обитатели остаются независимы: башню можно перегенерировать, не
   * трогая пулы, а пулы — очистить, не разбирая башню.
   */
  function drainSpawnQueue() {
    const queue = tower.spawnQueue
    if (!queue.length) return
    for (const point of queue) {
      if (point.type === 'enemy') enemies.spawn(point.kind, point)
      else pickups.spawn(point.kind, point)
    }
    queue.length = 0
  }

  /** Отмечает пройденные контрольные точки. */
  function checkCheckpoints() {
    for (const checkpoint of tower.checkpoints) {
      if (checkpoint.reached) continue
      // Засчитываем по высоте и близости: перепрыгнувший маяк по касательной
      // игрок всё равно заслужил передышку.
      if (player.position.y < checkpoint.y - 1) continue
      const dx = player.position.x - checkpoint.x
      const dz = player.position.z - checkpoint.z
      if (Math.hypot(dx, dz) > 8) continue

      checkpoint.reached = true
      checkpoint.beacon?.activate()
      events.emit('checkpoint', { position: player.position })
    }
  }

  function step(dt) {
    run.time += dt

    player.update(input, world, dt)
    tower.tick(dt)
    tower.update(player.position.y, dt)
    hazard.update(player.position.y, dt)
    world.hazardY = hazard.y

    drainSpawnQueue()
    checkCheckpoints()

    enemies.update(player, world, dt)
    pickups.update(player, world, dt)

    // Всё, что ушло достаточно далеко вниз, снимаем: пустота уже поглотила это.
    const cullY = hazard.y - 12
    enemies.despawnBelow(cullY)
    pickups.despawnBelow(cullY)

    // Очки за высоту начисляем только за новый рекорд забега — иначе можно было
    // бы фармить их, прыгая вверх-вниз на одном месте.
    if (player.state.maxHeight > run.paidHeight) {
      run.score += (player.state.maxHeight - run.paidHeight) * SCORE.perMetre * run.multiplier
      run.paidHeight = player.state.maxHeight
    }

    if (player.state.dead && run.state === 'playing') endRun()
  }

  let lastBiome = -1

  function frame(now) {
    requestAnimationFrame(frame)

    const rawDt = (now - lastTime) / 1000
    lastTime = now
    fps += (1 / Math.max(rawDt, 0.0001) - fps) * 0.1

    const dt = Math.min(rawDt, 0.25)

    if (run.state === 'playing') {
      accumulator += dt
      let steps = 0
      while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
        step(FIXED_STEP)
        accumulator -= FIXED_STEP
        steps++
      }
      // Не успели прожевать очередь — сбрасываем хвост, иначе долг копится вечно.
      if (steps === MAX_STEPS) accumulator = 0
    } else {
      // В меню и на паузе мир замирает, но оформление продолжает жить.
      accumulator = 0
    }

    if (input.consumePause()) togglePause()

    focusPoint.copy(player.position)
    const palette = view.update(player.position.y, focusPoint, dt)

    if (palette.index !== lastBiome) {
      lastBiome = palette.index
      audio.setBiome(palette.index)
      if (run.state === 'playing' && run.time > 1) events.emit('biome', { name: palette.name })
    }

    cameraRig.update(
      {
        position: player.position,
        velocity: player.velocity,
        facing: player.state.facing,
        // Чем ближе пустота, тем выше смотрим: игроку нужно видеть путь наверх.
        lookAhead: clamp01(hazard.danger * 0.6 + clamp01(player.velocity.y / 18) * 0.4),
      },
      dt,
    )

    fx.update(dt)
    hazard.setHorizon(palette.fog)
    audio.setDanger(hazard.danger)

    hud.update({
      height: Math.max(0, player.position.y),
      maxHeight: player.state.maxHeight,
      best: save.best,
      score: Math.floor(run.score),
      multiplier: run.multiplier,
      health: player.state.health,
      maxHealth: PLAYER.maxHealth,
      stamina: player.state.stamina,
      danger: hazard.danger,
      biomeName: palette.name,
      crystals: run.crystals,
      fps,
      visible: run.state === 'playing' || run.state === 'paused',
    })

    input.update()
    view.render()
  }

  // Звук в браузере включается только после жеста пользователя.
  const unlockAudio = () => {
    audio.resume()
    window.removeEventListener('pointerdown', unlockAudio)
    window.removeEventListener('keydown', unlockAudio)
  }
  window.addEventListener('pointerdown', unlockAudio)
  window.addEventListener('keydown', unlockAudio)

  // Свернули вкладку — ставим паузу сами: возвращаться в летящего в пустоту
  // героя обидно, а накопленное время всё равно пришлось бы выбросить.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && run.state === 'playing') togglePause()
  })

  openMenu()
  requestAnimationFrame(frame)
}
