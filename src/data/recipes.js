/**
 * Мастерские: берут сырьё со склада и выкладывают готовое изделие рядом с собой,
 * чтобы игрок его подобрал (как в «Весёлой фермe»).
 */

export const FACTORIES = {
  alchemy: {
    id: 'alchemy',
    name: 'Алхимическая',
    emoji: '⚗️',
    input: { pollen: 2, slime: 1 },
    output: 'elixir',
    time: 10,
    price: 400, // цена постройки на рынке
    roof: 0x67d3ff,
    wall: 0xefe0c2,
  },
  jewelry: {
    id: 'jewelry',
    name: 'Ювелирная',
    emoji: '📿',
    input: { pearl: 2, scale: 1 },
    output: 'amulet',
    time: 14,
    price: 700,
    roof: 0xffc63f,
    wall: 0xf3e6cd,
  },
  enchant: {
    id: 'enchant',
    name: 'Чароварня',
    emoji: '🪄',
    input: { essence: 1, feather: 1 },
    output: 'charm',
    time: 16,
    price: 1100,
    roof: 0xb98bff,
    wall: 0xe9dcf5,
  },
  artifactory: {
    id: 'artifactory',
    name: 'Артефактная',
    emoji: '💎',
    input: { elixir: 1, amulet: 1 },
    output: 'artifact',
    time: 22,
    price: 1800,
    roof: 0x63f0d8,
    wall: 0xdff6f2,
  },
}

export const factoryList = Object.values(FACTORIES)

export function factory(id) {
  const found = FACTORIES[id]
  if (!found) throw new Error(`Неизвестная мастерская: ${id}`)
  return found
}

/** Какая мастерская делает этот товар (для подсказок в интерфейсе). */
export function factoryProducing(itemId) {
  return factoryList.find((f) => f.output === itemId) ?? null
}
