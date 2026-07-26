/**
 * Детерминированный генератор случайных чисел.
 *
 * Башня строится по ходу подъёма, но обязана быть воспроизводимой: один и тот
 * же сид даёт одну и ту же башню. Иначе нельзя ни переиграть удачный забег, ни
 * поймать баг генерации, ни написать тест на неё. `Math.random()` для этого не
 * годится — его нельзя ни засеять, ни ответвить.
 */

/** Хеш строки или числа в 32-битный сид (алгоритм xmur3). */
export function hashSeed(input) {
  const str = String(input)
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/**
 * Мелкий быстрый ГПСЧ (mulberry32) с удобными методами.
 *
 * Возвращает объект, а не голую функцию: генератору нужны ответвления — каждый
 * сегмент башни берёт собственный поток чисел, чтобы порядок генерации соседних
 * сегментов не влиял на их содержимое.
 */
export function createRng(seed) {
  let state = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0

  /** Следующее число в [0, 1). */
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    /** Вещественное в [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Целое в [min, max] включительно. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** Правда с вероятностью `p`. */
    chance: (p) => next() < p,
    /** Случайный элемент массива. */
    pick: (list) => list[Math.floor(next() * list.length)],
    /**
     * Элемент по весам: `weights[i]` — относительная частота `list[i]`.
     * Списки разной длины обрезаются по короткому, нулевые веса пропускаются.
     */
    weighted: (list, weights) => {
      let total = 0
      const n = Math.min(list.length, weights.length)
      for (let i = 0; i < n; i++) total += Math.max(0, weights[i])
      if (total <= 0) return list[0]
      let roll = next() * total
      for (let i = 0; i < n; i++) {
        roll -= Math.max(0, weights[i])
        if (roll <= 0) return list[i]
      }
      return list[n - 1]
    },
    /** Симметричный разброс: значение в [-amount, amount). */
    spread: (amount) => (next() * 2 - 1) * amount,
    /** Перемешивание на месте (Фишер—Йетс) — возвращает тот же массив. */
    shuffle: (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
      }
      return list
    },
    /** Независимый поток, привязанный к метке, — для отдельного сегмента башни. */
    fork: (label) => createRng(hashSeed(`${state}:${label}`)),
  }
}

/**
 * Гладкий одномерный шум на основе сида.
 *
 * Нужен там, где случайность должна быть непрерывной: дрейф облаков, лёгкое
 * покачивание платформ, изгиб башни по высоте. Обычный ГПСЧ там дал бы дрожь.
 */
export function createNoise1d(seed) {
  const rng = createRng(seed)
  const table = new Float32Array(256)
  for (let i = 0; i < table.length; i++) table[i] = rng.next() * 2 - 1

  return (x) => {
    const i = Math.floor(x)
    const f = x - i
    const a = table[i & 255]
    const b = table[(i + 1) & 255]
    // Косинусная интерполяция: дешевле кубической, а стыки уже не видны.
    const t = (1 - Math.cos(f * Math.PI)) * 0.5
    return a + (b - a) * t
  }
}
