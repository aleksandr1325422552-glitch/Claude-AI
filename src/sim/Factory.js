import { factory as factoryDef } from '../data/recipes.js'

export const FSTATE = { IDLE: 'idle', WORKING: 'working', BLOCKED: 'blocked' }

const MAX_OUTPUT_ON_GROUND = 3

/**
 * Мастерская работает сама: как только на складе появляется нужное сырьё,
 * она забирает его и через `time` выкладывает изделие на землю рядом.
 * Изделие нужно подобрать — иначе площадка забьётся и работа встанет.
 */
export class Factory {
  constructor(id) {
    this.id = id
    this.def = factoryDef(id)
    this.state = FSTATE.IDLE
    this.timer = 0
    this.onGround = 0 // сколько изделий ждёт у мастерской
    this.enabled = true
    this.totalMade = 0
  }

  get progress() {
    return this.state === FSTATE.WORKING ? 1 - this.timer / this.def.time : 0
  }

  /** Понятная строка состояния для подсказки. */
  statusText(warehouse) {
    if (!this.enabled) return 'Остановлена'
    if (this.state === FSTATE.WORKING) return `Работает — ${Math.ceil(this.timer)} c`
    if (this.onGround >= MAX_OUTPUT_ON_GROUND) return 'Завалена готовым товаром'
    if (!warehouse.hasAll(this.def.input)) return 'Не хватает сырья'
    return 'Ждёт сырья'
  }

  update(dt, ctx) {
    if (this.state === FSTATE.WORKING) {
      this.timer -= dt
      if (this.timer <= 0) {
        this.timer = 0
        this.state = FSTATE.IDLE
        this.onGround++
        this.totalMade++
        ctx.onCraft(this, this.def.output)
      }
      return
    }

    if (!this.enabled) return
    if (this.onGround >= MAX_OUTPUT_ON_GROUND) {
      this.state = FSTATE.BLOCKED
      return
    }
    if (ctx.warehouse.takeAll(this.def.input)) {
      this.state = FSTATE.WORKING
      this.timer = this.def.time
      ctx.onStart(this)
    } else {
      this.state = FSTATE.IDLE
    }
  }

  /** Игрок подобрал изделие с площадки. */
  releaseOne() {
    this.onGround = Math.max(0, this.onGround - 1)
    if (this.state === FSTATE.BLOCKED) this.state = FSTATE.IDLE
  }
}
