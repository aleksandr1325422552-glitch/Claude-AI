/** Мелкие математические и вспомогательные функции без зависимостей. */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)

export const lerp = (a, b, t) => a + (b - a) * t

/** Плавное приближение значения к цели, независимое от частоты кадров. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))

export const TAU = Math.PI * 2

/** Кратчайшая разница между углами в диапазоне (-π, π]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** 1234 → «1 234» — тысячи отделяются узким пробелом. */
export function formatNumber(n) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/**
 * Русское склонение по числу: plural(2, 'фея', 'феи', 'фей') → 'феи'.
 */
export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

/** Стабильный уникальный идентификатор внутри сессии. */
let idCounter = 0
export const nextId = (prefix = 'id') => `${prefix}${++idCounter}`

export function removeFrom(array, item) {
  const i = array.indexOf(item)
  if (i >= 0) array.splice(i, 1)
  return i >= 0
}

/** Глубокая копия простых данных (объекты, массивы, примитивы). */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(deepClone)
  const out = {}
  for (const key of Object.keys(value)) out[key] = deepClone(value[key])
  return out
}
