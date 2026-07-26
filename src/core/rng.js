/**
 * Детерминированный генератор случайных чисел (mulberry32).
 * Нужен, чтобы поведение уровня можно было воспроизвести в тестах.
 */
export class Rng {
  constructor(seed = 0x9e3779b9) {
    this.seed = seed >>> 0
  }

  /** Число в [0, 1). */
  next() {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0
    let t = this.seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Число в [min, max). */
  range(min, max) {
    return min + this.next() * (max - min)
  }

  /** Целое в [min, max] включительно. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1))
  }

  /** true с вероятностью p. */
  chance(p) {
    return this.next() < p
  }

  pick(array) {
    return array[Math.floor(this.next() * array.length)]
  }

  /** Перемешивание на месте (Фишер–Йетс). */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }
}

/** Общий генератор для визуальных мелочей, где воспроизводимость не важна. */
export const rng = new Rng(1337)
