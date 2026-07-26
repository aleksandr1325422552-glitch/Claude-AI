/**
 * Математика, которой пользуются все системы игры.
 *
 * Отдельный модуль нужен, чтобы физика, камера и анимация сглаживали значения
 * одинаково: иначе камера дёргается там, где игрок движется плавно.
 */

export const TAU = Math.PI * 2

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)

export const clamp01 = (v) => clamp(v, 0, 1)

export const lerp = (a, b, t) => a + (b - a) * t

/** Обратная интерполяция: где значение `v` лежит между `a` и `b` (0..1). */
export const inverseLerp = (a, b, v) => (b === a ? 0 : clamp01((v - a) / (b - a)))

/** Переносит значение из одного диапазона в другой, обрезая по краям. */
export const remap = (v, inMin, inMax, outMin, outMax) => lerp(outMin, outMax, inverseLerp(inMin, inMax, v))

/**
 * Экспоненциальное сглаживание, независимое от частоты кадров.
 *
 * Наивное `v += (target - v) * 0.1` на 144 Гц догоняет цель вдвое быстрее, чем
 * на 72 Гц, — камера и повороты начинают зависеть от монитора. Здесь `lambda`
 * задаёт скорость в единицах «на секунду», и результат одинаков везде.
 */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt))

/** Сглаживание угла с учётом перехода через ±π (иначе разворот идёт «длинным путём»). */
export function dampAngle(current, target, lambda, dt) {
  return current + shortestAngle(current, target) * (1 - Math.exp(-lambda * dt))
}

/** Кратчайшая разница между углами в диапазоне (-π, π]. */
export function shortestAngle(from, to) {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/** Плавная ступенька Хермита — мягкие входы и выходы без единой ветки. */
export function smoothstep(edge0, edge1, x) {
  const t = inverseLerp(edge0, edge1, x)
  return t * t * (3 - 2 * t)
}

/** Тянет значение к нулю на заданную величину, не проскакивая через ноль. */
export function moveTowards(current, target, maxDelta) {
  const diff = target - current
  if (Math.abs(diff) <= maxDelta) return target
  return current + Math.sign(diff) * maxDelta
}

export const easeOutCubic = (t) => 1 - (1 - t) ** 3
export const easeInCubic = (t) => t * t * t
export const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
export const easeOutElastic = (t) =>
  t === 0 || t === 1 ? t : 2 ** (-9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1

/** Пинг-понг: 0 → 1 → 0 за период. Удобно для «дыхания» и парения. */
export const pingPong = (t) => 1 - Math.abs(((t % 2) + 2) % 2 - 1)

/**
 * Форматирует высоту для интерфейса.
 *
 * До километра показываем метры целыми — так виден каждый прыжок; дальше
 * переходим на километры с одним знаком, иначе число рябит.
 */
export function formatHeight(metres) {
  if (metres < 1000) return `${Math.floor(metres)} м`
  return `${(metres / 1000).toFixed(1)} км`
}

/** «12 345» — узкий пробел между разрядами, чтобы счёт читался с одного взгляда. */
export function formatScore(value) {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
