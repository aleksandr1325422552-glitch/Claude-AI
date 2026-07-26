/**
 * Постоянные улучшения, которые покупаются в лавке между уровнями.
 * Каждое имеет несколько ступеней; цена растёт геометрически.
 */

export const BASE_STATS = {
  wellMax: 8, // ёмкость колодца
  wellRefill: 0.55, // вода в секунду
  canMax: 3, // ёмкость лейки
  grassRate: 0.3, // доля роста травы в секунду (1 / 3.3 c)
  storeCap: 12, // мест на складе
  truckCap: 4, // мест в фургоне
  truckTime: 16, // секунд на рейс до рынка и обратно
  cageCap: 2, // мест в клетке
  hatchMul: 1, // множитель времени инкубации
  netSpeed: 0, // предметов в секунду, которые подбирает волшебный сачок
}

export const UPGRADES = {
  well: {
    id: 'well',
    name: 'Глубокий колодец',
    emoji: '⛲',
    levels: 5,
    baseCost: 180,
    growth: 1.75,
    desc: '+5 к запасу воды и быстрее наполняется',
    apply: (s) => {
      s.wellMax += 5
      s.wellRefill += 0.3
    },
  },
  can: {
    id: 'can',
    name: 'Большая лейка',
    emoji: '🪣',
    levels: 4,
    baseCost: 150,
    growth: 1.8,
    desc: '+2 воды в лейке — меньше беготни к колодцу',
    apply: (s) => {
      s.canMax += 2
    },
  },
  grass: {
    id: 'grass',
    name: 'Волшебное удобрение',
    emoji: '🌱',
    levels: 4,
    baseCost: 220,
    growth: 1.85,
    desc: 'Трава растёт на 25% быстрее',
    apply: (s) => {
      s.grassRate *= 1.25
    },
  },
  store: {
    id: 'store',
    name: 'Пристройка склада',
    emoji: '📦',
    levels: 5,
    baseCost: 200,
    growth: 1.7,
    desc: '+6 мест на складе',
    apply: (s) => {
      s.storeCap += 6
    },
  },
  truck: {
    id: 'truck',
    name: 'Быстрый фургон',
    emoji: '🚚',
    levels: 5,
    baseCost: 260,
    growth: 1.75,
    desc: '+2 места в фургоне, рейс на 15% быстрее',
    apply: (s) => {
      s.truckCap += 2
      s.truckTime *= 0.85
    },
  },
  cage: {
    id: 'cage',
    name: 'Крепкая клетка',
    emoji: '🪤',
    levels: 3,
    baseCost: 240,
    growth: 1.9,
    desc: '+2 места для пойманных тварей',
    apply: (s) => {
      s.cageCap += 2
    },
  },
  nursery: {
    id: 'nursery',
    name: 'Тёплый инкубатор',
    emoji: '🥚',
    levels: 4,
    baseCost: 300,
    growth: 1.8,
    desc: 'Яйца вылупляются на 15% быстрее',
    apply: (s) => {
      s.hatchMul *= 0.85
    },
  },
  net: {
    id: 'net',
    name: 'Волшебный сачок',
    emoji: '🥅',
    levels: 3,
    baseCost: 420,
    growth: 2.0,
    desc: 'Сам подбирает лежащий товар — начиная с того, что скоро пропадёт',
    apply: (s) => {
      s.netSpeed += 0.3
    },
  },
}

export const upgradeList = Object.values(UPGRADES)

/** Цена следующей ступени; null — всё уже куплено. */
export function upgradeCost(id, owned) {
  const def = UPGRADES[id]
  if (owned >= def.levels) return null
  return Math.round(def.baseCost * Math.pow(def.growth, owned) / 10) * 10
}

/** Считает итоговые характеристики фермы с учётом купленных улучшений. */
export function computeStats(upgrades = {}) {
  const stats = { ...BASE_STATS }
  for (const def of upgradeList) {
    const owned = Math.min(upgrades[def.id] ?? 0, def.levels)
    for (let i = 0; i < owned; i++) def.apply(stats)
  }
  stats.wellMax = Math.round(stats.wellMax)
  stats.canMax = Math.round(stats.canMax)
  stats.storeCap = Math.round(stats.storeCap)
  stats.truckCap = Math.round(stats.truckCap)
  stats.cageCap = Math.round(stats.cageCap)
  return stats
}
