import { itemList } from '../data/items.js'

/** Склад: ограниченное число мест, каждый товар занимает одно место. */
export class Warehouse {
  constructor(capacity) {
    this.capacity = capacity
    this.items = new Map()
  }

  get count() {
    let n = 0
    for (const v of this.items.values()) n += v
    return n
  }

  get free() {
    return Math.max(0, this.capacity - this.count)
  }

  get isFull() {
    return this.free <= 0
  }

  get(id) {
    return this.items.get(id) ?? 0
  }

  has(id, n = 1) {
    return this.get(id) >= n
  }

  hasAll(cost) {
    for (const [id, n] of Object.entries(cost)) if (!this.has(id, n)) return false
    return true
  }

  /** Возвращает, сколько реально удалось положить. */
  add(id, n = 1) {
    const fit = Math.min(n, this.free)
    if (fit <= 0) return 0
    this.items.set(id, this.get(id) + fit)
    return fit
  }

  take(id, n = 1) {
    const have = this.get(id)
    const taken = Math.min(have, n)
    if (taken <= 0) return 0
    if (have - taken <= 0) this.items.delete(id)
    else this.items.set(id, have - taken)
    return taken
  }

  takeAll(cost) {
    if (!this.hasAll(cost)) return false
    for (const [id, n] of Object.entries(cost)) this.take(id, n)
    return true
  }

  /** Содержимое в порядке объявления товаров — чтобы слоты не «прыгали». */
  entries() {
    return itemList.filter((it) => this.get(it.id) > 0).map((it) => ({ item: it, count: this.get(it.id) }))
  }
}
