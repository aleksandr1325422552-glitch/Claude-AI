/**
 * Процедурный звук на WebAudio: в игре нет ни одного аудиофайла.
 *
 * Каждый эффект — короткая огибающая на паре осцилляторов. Такой подход стоит
 * почти ничего по памяти, а главное — позволяет варьировать высоту и тембр
 * от случая к случаю, поэтому часто повторяющиеся звуки (прыжки, шаги) не
 * приедаются так, как приедается один и тот же сэмпл.
 */

/** Ноты лада в полутонах от тоники — по ним ведётся фоновая тема. */
const SCALES = [
  [0, 2, 4, 7, 9], // мажорная пентатоника — тепло, для нижних поясов
  [0, 2, 4, 7, 9],
  [0, 2, 3, 7, 9], // с минорной терцией — облачный пояс звучит задумчивее
  [0, 2, 3, 5, 7],
  [0, 1, 3, 5, 7], // фригийский оттенок — гроза
  [0, 3, 5, 7, 10], // минорная пентатоника — пустота
]

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12)

export function createAudio() {
  /** @type {AudioContext|null} Создаётся лениво: до жеста пользователя браузер всё равно не даст звука. */
  let ctx = null
  let master = null
  let musicGain = null
  let sfxGain = null
  let droneGain = null
  let droneFilter = null

  let muted = false
  let musicEnabled = true
  let danger = 0
  let biome = 0

  // Ограничитель одновременных голосов: без него частые звуки складываются
  // в клиппинг, и вместо игры получается треск.
  let activeVoices = 0
  const MAX_VOICES = 14

  let musicTimer = null
  let musicStep = 0

  /** Звук отключён насовсем: браузер не дал его создать. */
  let unavailable = false

  function ensure() {
    if (ctx) return ctx
    if (unavailable) return null

    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null

    try {
      ctx = new Ctx()
    } catch {
      // Во встроенном кадре звук может быть закрыт политикой разрешений, и
      // тогда создание контекста бросает исключение, а не возвращает пустоту.
      // Игра обязана пережить это молча: беззвучная игра лучше упавшей.
      unavailable = true
      return null
    }

    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.8
    master.connect(ctx.destination)

    sfxGain = ctx.createGain()
    sfxGain.gain.value = 0.85
    sfxGain.connect(master)

    musicGain = ctx.createGain()
    musicGain.gain.value = musicEnabled ? 0.32 : 0
    musicGain.connect(master)

    // Гул пустоты идёт через фильтр: чем ближе опасность, тем он громче и
    // ниже. Это работает как предупреждение, которое слышно даже когда игрок
    // смотрит вверх и не видит саму пустоту.
    droneFilter = ctx.createBiquadFilter()
    droneFilter.type = 'lowpass'
    droneFilter.frequency.value = 220
    droneFilter.connect(master)

    droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneGain.connect(droneFilter)

    const drone = ctx.createOscillator()
    drone.type = 'sawtooth'
    drone.frequency.value = 42
    drone.connect(droneGain)
    drone.start()

    const droneHigh = ctx.createOscillator()
    droneHigh.type = 'triangle'
    droneHigh.frequency.value = 63
    droneHigh.connect(droneGain)
    droneHigh.start()

    startMusic()
    return ctx
  }

  /** Короткий шумовой буфер — основа для «земляных» и свистящих звуков. */
  let noiseBuffer = null
  function noise() {
    if (!noiseBuffer) {
      const length = ctx.sampleRate * 0.5
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    }
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer
    return source
  }

  /**
   * Тональный голос с огибающей «атака — спад».
   *
   * @param {object} o
   * @param {number} o.from      Начальная частота.
   * @param {number} [o.to]      Конечная (глиссандо), по умолчанию равна начальной.
   * @param {number} o.duration
   * @param {number} [o.gain]
   * @param {OscillatorType} [o.type]
   * @param {number} [o.delay]
   */
  function tone({ from, to, duration, gain = 0.25, type = 'triangle', delay = 0 }) {
    if (!ctx || activeVoices >= MAX_VOICES) return
    activeVoices++

    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration)

    const env = ctx.createGain()
    // Ненулевое стартовое значение обязательно: экспоненциальный спад к нулю
    // не определён, а линейный даёт слышимый щелчок на хвосте.
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, duration * 0.2))
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)

    osc.connect(env)
    env.connect(sfxGain)
    osc.start(t)
    osc.stop(t + duration + 0.02)
    osc.onended = () => {
      activeVoices--
      env.disconnect()
    }
  }

  /** Шумовой голос через фильтр — удары, свист, шаги. */
  function hiss({ duration, gain = 0.2, type = 'bandpass', frequency = 900, q = 1, sweepTo = null, delay = 0 }) {
    if (!ctx || activeVoices >= MAX_VOICES) return
    activeVoices++

    const t = ctx.currentTime + delay
    const source = noise()
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(frequency, t)
    filter.Q.value = q
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + duration)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)

    source.connect(filter)
    filter.connect(env)
    env.connect(sfxGain)
    source.start(t)
    source.stop(t + duration + 0.02)
    source.onended = () => {
      activeVoices--
      env.disconnect()
    }
  }

  const EFFECTS = {
    jump: () => tone({ from: 300, to: 660, duration: 0.16, gain: 0.22, type: 'triangle' }),
    doubleJump: () => {
      tone({ from: 480, to: 940, duration: 0.18, gain: 0.2, type: 'triangle' })
      hiss({ duration: 0.2, gain: 0.1, frequency: 2400, sweepTo: 5200, q: 2 })
    },
    land: () => {
      tone({ from: 150, to: 70, duration: 0.13, gain: 0.26, type: 'sine' })
      hiss({ duration: 0.11, gain: 0.13, type: 'lowpass', frequency: 900, sweepTo: 200 })
    },
    dash: () => hiss({ duration: 0.26, gain: 0.22, frequency: 700, sweepTo: 3600, q: 3.5 }),
    hurt: () => {
      tone({ from: 320, to: 90, duration: 0.28, gain: 0.3, type: 'sawtooth' })
      hiss({ duration: 0.16, gain: 0.14, frequency: 1400, sweepTo: 300 })
    },
    die: () => {
      tone({ from: 260, to: 55, duration: 0.85, gain: 0.32, type: 'sawtooth' })
      tone({ from: 130, to: 40, duration: 1.0, gain: 0.22, type: 'triangle', delay: 0.05 })
    },
    // Чистая мажорная терция: подбор обязан звучать однозначно приятно.
    crystal: () => {
      tone({ from: 880, duration: 0.16, gain: 0.16, type: 'sine' })
      tone({ from: 1108, duration: 0.2, gain: 0.13, type: 'sine', delay: 0.05 })
    },
    stamina: () => {
      tone({ from: 520, to: 780, duration: 0.22, gain: 0.16, type: 'sine' })
      tone({ from: 780, to: 1040, duration: 0.18, gain: 0.1, type: 'sine', delay: 0.08 })
    },
    // Восходящее арпеджио — единственный «победный» звук в игре.
    checkpoint: () => {
      const base = 523.25
      for (let i = 0; i < 4; i++) {
        tone({ from: base * 2 ** (i / 4), duration: 0.28, gain: 0.15, type: 'triangle', delay: i * 0.075 })
      }
    },
    enemyHit: () => {
      hiss({ duration: 0.14, gain: 0.2, frequency: 1800, sweepTo: 400, q: 1.5 })
      tone({ from: 200, to: 80, duration: 0.14, gain: 0.18, type: 'square' })
    },
    crumble: () => hiss({ duration: 0.45, gain: 0.16, type: 'lowpass', frequency: 1400, sweepTo: 220, q: 0.7 }),
    bounce: () => tone({ from: 200, to: 900, duration: 0.22, gain: 0.26, type: 'sine' }),
    menu: () => tone({ from: 520, duration: 0.1, gain: 0.12, type: 'sine' }),
    start: () => {
      for (let i = 0; i < 3; i++) {
        tone({ from: 392 * 2 ** (i / 3), duration: 0.3, gain: 0.16, type: 'triangle', delay: i * 0.09 })
      }
    },
  }

  /**
   * Фоновая тема.
   *
   * Ведётся не по петле в четыре такта, а блужданием по ступеням лада: шаг
   * вверх или вниз выбирается случайно с перевесом в сторону тоники. Мелодия
   * получается бесконечной и не успевает надоесть за долгий забег.
   */
  function startMusic() {
    if (musicTimer) return
    let degree = 0

    const beat = () => {
      if (!ctx || !musicEnabled) return
      const scale = SCALES[Math.min(biome, SCALES.length - 1)]

      // Ближе к пустоте музыка редеет: пропускаем доли тем чаще, чем опаснее.
      if (Math.random() < 0.25 + danger * 0.35) {
        musicStep++
        return
      }

      const step = Math.random() < 0.5 ? 1 : -1
      degree += step
      // Мягко возвращаем к центру, чтобы мелодия не уползала в крайние октавы.
      if (degree > 6) degree -= 3
      if (degree < -6) degree += 3

      const octave = Math.floor(degree / scale.length)
      const index = ((degree % scale.length) + scale.length) % scale.length
      const note = 60 + scale[index] + octave * 12

      tone({ from: midiToHz(note), duration: 0.9, gain: 0.055, type: 'sine' })
      // Бас каждую четвёртую долю — он держит темп подъёма.
      if (musicStep % 4 === 0) {
        tone({ from: midiToHz(note - 24), duration: 1.3, gain: 0.05, type: 'triangle' })
      }
      musicStep++
    }

    musicTimer = setInterval(beat, 420)
  }

  return {
    async resume() {
      ensure()
      if (ctx?.state === 'suspended') await ctx.resume()
    },

    play(name) {
      if (muted) return
      ensure()
      if (!ctx || ctx.state !== 'running') return
      EFFECTS[name]?.()
    },

    setMusic(enabled) {
      musicEnabled = enabled
      if (musicGain) musicGain.gain.value = enabled ? 0.32 : 0
    },

    setMuted(value) {
      muted = value
      if (master) master.gain.value = value ? 0 : 0.8
    },

    /** @param {number} value 0..1 — близость пустоты. */
    setDanger(value) {
      danger = value
      if (!droneGain || !droneFilter) return
      droneGain.gain.value = value * 0.16
      droneFilter.frequency.value = 140 + value * 480
      // Музыку приглушаем: тревога должна быть слышна поверх неё.
      if (musicGain && musicEnabled) musicGain.gain.value = 0.32 * (1 - value * 0.55)
    },

    setBiome(index) {
      biome = index
    },

    dispose() {
      if (musicTimer) clearInterval(musicTimer)
      musicTimer = null
      ctx?.close()
      ctx = null
    },
  }
}
