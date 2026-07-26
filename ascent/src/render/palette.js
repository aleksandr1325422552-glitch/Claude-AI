import * as THREE from 'three'
import { clamp01, inverseLerp } from '../core/util.js'

/**
 * Цвет всей игры, разложенный по высоте.
 *
 * Подъём — это главная механика, поэтому он должен читаться глазом, а не только
 * по счётчику метров. Каждые несколько сотен метров мир перекрашивается: тёплый
 * солнечный луг внизу постепенно становится ледником, грозой и наконец звёздной
 * пустотой. Между поясами цвета не переключаются, а перетекают, так что момент
 * смены биома не заметен — заметно только, что стало холоднее и темнее.
 *
 * Все системы (небо, туман, свет, камни, враги) берут цвет отсюда и потому
 * всегда согласованы: достаточно поправить один пояс, чтобы перекрасился кадр.
 */

/**
 * @typedef {object} Biome
 * @property {string} name      Название пояса для интерфейса.
 * @property {number} altitude  Высота в метрах, на которой пояс звучит в полную силу.
 * @property {number} skyTop    Цвет зенита.
 * @property {number} skyBottom Цвет горизонта.
 * @property {number} fog       Туман; совпадает с горизонтом, чтобы даль растворялась в небе.
 * @property {number} sun       Цвет направленного света.
 * @property {number} ambient   Заполняющий свет — «отражение» неба в тенях.
 * @property {number} rock      Основной камень платформ.
 * @property {number} rockDeep  Затенённые бока камня.
 * @property {number} foliage   Трава, листва, мох.
 * @property {number} accent    Акцент: кристаллы, флаги, огни маяков.
 * @property {number} sunIntensity     Яркость направленного света.
 * @property {number} ambientIntensity Яркость заполняющего.
 * @property {number} fogDensity       Плотность экспоненциального тумана.
 * @property {number} starOpacity      Насколько проступают звёзды (0 внизу, 1 в пустоте).
 */

/** @type {Biome[]} Пояса обязаны идти по возрастанию высоты. */
export const BIOMES = [
  {
    name: 'Подножие',
    altitude: 0,
    skyTop: 0x5fb8e8,
    skyBottom: 0xffd9a8,
    fog: 0xffd9a8,
    sun: 0xfff2d4,
    ambient: 0x9fc7e8,
    rock: 0x8f7a5f,
    rockDeep: 0x5f4f3c,
    foliage: 0x7bc46a,
    accent: 0xffc85c,
    sunIntensity: 1.55,
    ambientIntensity: 0.85,
    fogDensity: 0.0042,
    starOpacity: 0,
  },
  {
    name: 'Утёсы',
    altitude: 420,
    skyTop: 0x4a9ad6,
    skyBottom: 0xffb989,
    fog: 0xf7b48b,
    sun: 0xffdcae,
    ambient: 0xb08fa8,
    rock: 0xb57d55,
    rockDeep: 0x77492f,
    foliage: 0x8fae5c,
    accent: 0xff9b54,
    sunIntensity: 1.5,
    ambientIntensity: 0.8,
    fogDensity: 0.0048,
    starOpacity: 0,
  },
  {
    name: 'Облачный пояс',
    altitude: 950,
    skyTop: 0x6f86d8,
    skyBottom: 0xffc0d4,
    fog: 0xf3c2dc,
    sun: 0xffd8e2,
    ambient: 0xc0aee0,
    rock: 0xa79ec0,
    rockDeep: 0x6a6088,
    foliage: 0x9fd8c4,
    accent: 0xff7fb0,
    sunIntensity: 1.35,
    ambientIntensity: 0.95,
    fogDensity: 0.0062,
    starOpacity: 0.05,
  },
  {
    name: 'Ледник',
    altitude: 1600,
    skyTop: 0x2f5c9e,
    skyBottom: 0xa9dcf0,
    fog: 0xa9dcf0,
    sun: 0xe8f6ff,
    ambient: 0x7fa8d8,
    rock: 0x9fc4d8,
    rockDeep: 0x5b7e9c,
    foliage: 0xd6f0f7,
    accent: 0x5fe0ff,
    sunIntensity: 1.25,
    ambientIntensity: 0.9,
    fogDensity: 0.0075,
    starOpacity: 0.2,
  },
  {
    name: 'Гроза',
    altitude: 2400,
    skyTop: 0x161a3c,
    skyBottom: 0x4b3f74,
    fog: 0x3b3564,
    sun: 0xa8b4ff,
    ambient: 0x4a4478,
    rock: 0x5a5378,
    rockDeep: 0x322d4c,
    foliage: 0x6f8fb0,
    accent: 0xb06fff,
    sunIntensity: 0.95,
    ambientIntensity: 0.75,
    fogDensity: 0.0092,
    starOpacity: 0.55,
  },
  {
    name: 'Звёздный предел',
    altitude: 3400,
    skyTop: 0x05060f,
    skyBottom: 0x1b1240,
    fog: 0x140f30,
    sun: 0x9fd8ff,
    ambient: 0x2a2560,
    rock: 0x3c3660,
    rockDeep: 0x1e1a38,
    foliage: 0x7fe0d0,
    accent: 0x6fffe0,
    sunIntensity: 0.85,
    ambientIntensity: 0.7,
    fogDensity: 0.0068,
    starOpacity: 1,
  },
]

/** Ключи, которые смешиваются как цвета (остальные — как числа). */
const COLOR_KEYS = ['skyTop', 'skyBottom', 'fog', 'sun', 'ambient', 'rock', 'rockDeep', 'foliage', 'accent']
const NUMBER_KEYS = ['sunIntensity', 'ambientIntensity', 'fogDensity', 'starOpacity']

/**
 * Состояние палитры на текущей высоте.
 *
 * Цвета отдаются как THREE.Color и переиспользуются между кадрами: палитра
 * пересчитывается каждый кадр, и создавать здесь новые объекты — верный способ
 * нагрузить сборщик мусора рывками ровно во время игры.
 */
export function createPalette() {
  const colors = {}
  for (const key of COLOR_KEYS) colors[key] = new THREE.Color()

  const state = {
    ...colors,
    sunIntensity: 0,
    ambientIntensity: 0,
    fogDensity: 0,
    starOpacity: 0,
    /** Индекс ближайшего пояса и его название — для интерфейса. */
    index: 0,
    name: BIOMES[0].name,
    /** Прогресс внутри перехода: 0 — начало пояса, 1 — следующий пояс. */
    blend: 0,
  }

  const tmpA = new THREE.Color()
  const tmpB = new THREE.Color()

  /** Пересчитывает состояние под высоту в метрах. */
  function update(height) {
    let upper = 1
    while (upper < BIOMES.length - 1 && height > BIOMES[upper].altitude) upper++
    const lower = upper - 1
    const a = BIOMES[lower]
    const b = BIOMES[upper]
    const t = inverseLerp(a.altitude, b.altitude, height)

    for (const key of COLOR_KEYS) {
      tmpA.setHex(a[key])
      tmpB.setHex(b[key])
      state[key].copy(tmpA).lerp(tmpB, t)
    }
    for (const key of NUMBER_KEYS) state[key] = a[key] + (b[key] - a[key]) * t

    state.index = t < 0.5 ? lower : upper
    state.name = BIOMES[state.index].name
    state.blend = t
    return state
  }

  update(0)
  return { state, update }
}

/**
 * Доля пути до вершины пояса — используется для подсказок в интерфейсе.
 * За последним поясом всегда возвращает 1.
 */
export function biomeProgress(height) {
  const last = BIOMES[BIOMES.length - 1]
  if (height >= last.altitude) return 1
  let upper = 1
  while (upper < BIOMES.length - 1 && height > BIOMES[upper].altitude) upper++
  return clamp01(inverseLerp(BIOMES[upper - 1].altitude, BIOMES[upper].altitude, height))
}
