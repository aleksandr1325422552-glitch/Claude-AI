import { item } from '../data/items.js'
import { clamp } from '../core/util.js'

const PRESSURE_PER_UNIT = 0.075 // насколько просаживается цена за проданную единицу
const PRESSURE_RECOVERY = 0.022 // восстановление в секунду
const MAX_DISCOUNT = 0.45 // цена не падает ниже 55% базовой

/**
 * Рынок с «уставанием»: чем больше однотипного товара вы привозите,
 * тем дешевле его берут. Цена медленно восстанавливается.
 */
export class Market {
  constructor() {
    this.pressure = new Map()
  }

  pressureOf(id) {
    return this.pressure.get(id) ?? 0
  }

  /** Текущая цена одной единицы. */
  priceOf(id) {
    const base = item(id).price
    return Math.max(1, Math.round(base * (1 - MAX_DISCOUNT * this.pressureOf(id))))
  }

  /** Во сколько раз цена отличается от базовой (для индикатора в интерфейсе). */
  ratioOf(id) {
    return this.priceOf(id) / item(id).price
  }

  /** Продать n единиц, вернуть выручку. Цена считается по каждой единице. */
  sell(id, n) {
    let total = 0
    for (let i = 0; i < n; i++) {
      total += this.priceOf(id)
      this.pressure.set(id, clamp(this.pressureOf(id) + PRESSURE_PER_UNIT, 0, 1))
    }
    return total
  }

  /** Сколько дадут за груз, без изменения цен. */
  quote(cargo) {
    const snapshot = new Map(this.pressure)
    let total = 0
    for (const [id, n] of cargo) total += this.sell(id, n)
    this.pressure = snapshot
    return total
  }

  update(dt) {
    for (const [id, value] of this.pressure) {
      const next = value - PRESSURE_RECOVERY * dt
      if (next <= 0) this.pressure.delete(id)
      else this.pressure.set(id, next)
    }
  }
}
