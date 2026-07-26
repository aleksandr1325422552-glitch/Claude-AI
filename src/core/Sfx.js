/**
 * Звук целиком синтезируется через WebAudio — никаких внешних файлов.
 * Контекст создаётся лениво, при первом жесте пользователя, иначе браузер
 * заблокирует автозапуск.
 */

const NOTES = { C4: 261.6, D4: 293.7, E4: 329.6, G4: 392.0, A4: 440.0, C5: 523.3, E5: 659.3, G5: 784.0, C6: 1046.5 }

export class Sfx {
  constructor(enabled = true) {
    this.enabled = enabled
    this.ctx = null
    this.master = null
  }

  /** Вызывается из обработчика реального клика/нажатия. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.32
    this.master.connect(this.ctx.destination)
  }

  setEnabled(on) {
    this.enabled = on
    if (this.master) this.master.gain.value = on ? 0.32 : 0
  }

  /** Одиночный тон с огибающей. */
  tone({ freq = 440, dur = 0.12, type = 'triangle', gain = 0.3, delay = 0, slideTo = null, detune = 0 }) {
    if (!this.enabled || !this.ctx) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
    if (detune) osc.detune.value = detune
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.25))
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(env).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  /** Короткий шумовой всплеск — шаги, удары, плеск. */
  noise({ dur = 0.16, gain = 0.22, lowpass = 1600, delay = 0 }) {
    if (!this.enabled || !this.ctx) return
    const t0 = this.ctx.currentTime + delay
    const frames = Math.floor(this.ctx.sampleRate * dur)
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = lowpass
    const env = this.ctx.createGain()
    env.gain.value = gain
    src.connect(filter).connect(env).connect(this.master)
    src.start(t0)
  }

  // --- Игровые звуки -------------------------------------------------------

  play(name) {
    if (!this.enabled) return
    switch (name) {
      case 'pick':
        this.tone({ freq: NOTES.E5, dur: 0.09, type: 'triangle', gain: 0.26 })
        this.tone({ freq: NOTES.G5, dur: 0.08, gain: 0.16, delay: 0.05 })
        break
      case 'coin':
        this.tone({ freq: NOTES.C6, dur: 0.08, type: 'square', gain: 0.14 })
        this.tone({ freq: 1318, dur: 0.14, type: 'square', gain: 0.12, delay: 0.06 })
        break
      case 'water':
        this.noise({ dur: 0.22, gain: 0.16, lowpass: 900 })
        this.tone({ freq: 320, dur: 0.16, type: 'sine', gain: 0.1, slideTo: 180 })
        break
      case 'pump':
        this.tone({ freq: 180, dur: 0.14, type: 'sawtooth', gain: 0.12, slideTo: 320 })
        break
      case 'plant':
        this.tone({ freq: 420, dur: 0.13, type: 'sine', gain: 0.16, slideTo: 620 })
        break
      case 'craft':
        this.tone({ freq: NOTES.C4, dur: 0.1, type: 'square', gain: 0.1 })
        this.tone({ freq: NOTES.E4, dur: 0.1, type: 'square', gain: 0.1, delay: 0.08 })
        this.tone({ freq: NOTES.G4, dur: 0.16, type: 'square', gain: 0.12, delay: 0.16 })
        break
      case 'hatch':
        this.noise({ dur: 0.12, gain: 0.14, lowpass: 3000 })
        this.tone({ freq: 500, dur: 0.2, type: 'triangle', gain: 0.2, slideTo: 900 })
        break
      case 'egg':
        this.tone({ freq: 300, dur: 0.18, type: 'sine', gain: 0.18, slideTo: 460 })
        break
      case 'truck':
        this.tone({ freq: 120, dur: 0.5, type: 'sawtooth', gain: 0.1, slideTo: 90 })
        this.noise({ dur: 0.4, gain: 0.07, lowpass: 500 })
        break
      case 'sell':
        this.tone({ freq: NOTES.G4, dur: 0.1, type: 'triangle', gain: 0.2 })
        this.tone({ freq: NOTES.C5, dur: 0.1, type: 'triangle', gain: 0.2, delay: 0.08 })
        this.tone({ freq: NOTES.E5, dur: 0.22, type: 'triangle', gain: 0.22, delay: 0.16 })
        break
      case 'hit':
        this.noise({ dur: 0.1, gain: 0.24, lowpass: 2400 })
        this.tone({ freq: 220, dur: 0.08, type: 'square', gain: 0.14, slideTo: 130 })
        break
      case 'trap':
        this.noise({ dur: 0.18, gain: 0.26, lowpass: 1200 })
        this.tone({ freq: 90, dur: 0.24, type: 'sawtooth', gain: 0.16, slideTo: 60 })
        break
      case 'raider':
        this.tone({ freq: 150, dur: 0.32, type: 'sawtooth', gain: 0.14, slideTo: 70 })
        break
      case 'error':
        this.tone({ freq: 200, dur: 0.16, type: 'square', gain: 0.14, slideTo: 130 })
        break
      case 'win':
        ;[NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.22, delay: i * 0.11 }),
        )
        break
      case 'lose':
        ;[NOTES.G4, NOTES.E4, NOTES.C4, 196].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.34, type: 'sawtooth', gain: 0.14, delay: i * 0.14 }),
        )
        break
      case 'upgrade':
        ;[NOTES.E4, NOTES.A4, NOTES.C5, NOTES.E5].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.22, type: 'square', gain: 0.12, delay: i * 0.07 }),
        )
        break
      case 'ui':
        this.tone({ freq: 620, dur: 0.05, type: 'sine', gain: 0.12 })
        break
      default:
        break
    }
  }
}
