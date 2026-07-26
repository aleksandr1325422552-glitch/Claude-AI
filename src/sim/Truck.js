import { SPOTS } from '../data/layout.js'

export const TSTATE = { IDLE: 'idle', AWAY: 'away' }

/**
 * Фургон. Игрок грузит товар со склада, отправляет на рынок, и через рейс
 * фургон возвращается с монетами.
 */
export class Truck {
  constructor(capacity, tripTime) {
    this.capacity = capacity
    this.tripTime = tripTime
    this.cargo = new Map()
    this.state = TSTATE.IDLE
    this.timer = 0
    this.x = SPOTS.truck.x
    this.z = SPOTS.truck.z
    this.lastRevenue = 0
  }

  get load() {
    let n = 0
    for (const v of this.cargo.values()) n += v
    return n
  }

  get free() {
    return Math.max(0, this.capacity - this.load)
  }

  get isIdle() {
    return this.state === TSTATE.IDLE
  }

  /** 0..1 — доля пути (0 — на ферме, 0.5 — на рынке, 1 — снова дома). */
  get tripProgress() {
    if (this.state !== TSTATE.AWAY) return 0
    return 1 - this.timer / this.tripTime
  }

  add(id, n = 1) {
    if (this.state !== TSTATE.IDLE) return 0
    const fit = Math.min(n, this.free)
    if (fit <= 0) return 0
    this.cargo.set(id, (this.cargo.get(id) ?? 0) + fit)
    return fit
  }

  remove(id, n = 1) {
    if (this.state !== TSTATE.IDLE) return 0
    const have = this.cargo.get(id) ?? 0
    const taken = Math.min(have, n)
    if (taken <= 0) return 0
    if (have - taken <= 0) this.cargo.delete(id)
    else this.cargo.set(id, have - taken)
    return taken
  }

  send() {
    if (this.state !== TSTATE.IDLE || this.load === 0) return false
    this.state = TSTATE.AWAY
    this.timer = this.tripTime
    return true
  }

  update(dt, ctx) {
    if (this.state !== TSTATE.AWAY) return
    const before = this.timer
    this.timer -= dt

    // Продажа происходит в середине рейса — «на рынке».
    const half = this.tripTime / 2
    if (before > half && this.timer <= half) {
      let revenue = 0
      for (const [id, n] of this.cargo) revenue += ctx.market.sell(id, n)
      this.lastRevenue = revenue
      ctx.onSold(revenue, new Map(this.cargo))
      this.cargo.clear()
    }

    if (this.timer <= 0) {
      this.timer = 0
      this.state = TSTATE.IDLE
      ctx.onReturn(this.lastRevenue)
    }
  }
}
