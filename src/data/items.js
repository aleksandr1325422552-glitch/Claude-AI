/**
 * Товары. `emoji` используется только в HTML-интерфейсе, а `shape` и `color` —
 * для процедурной 3D-модели предмета на земле (чтобы не зависеть от шрифтов).
 */

export const ITEMS = {
  // --- сырьё, которое дают существа ---
  pollen: { id: 'pollen', name: 'Пыльца', emoji: '✨', price: 12, tier: 0, shape: 'star', color: 0xffe08a, accent: 0xfff6d6 },
  pearl: { id: 'pearl', name: 'Жемчуг', emoji: '🦪', price: 18, tier: 0, shape: 'pearl', color: 0xf2f7ff, accent: 0x9fd4e8 },
  essence: { id: 'essence', name: 'Эссенция', emoji: '🧪', price: 26, tier: 0, shape: 'vial', color: 0x7ee38b, accent: 0xdff7e4 },
  slime: { id: 'slime', name: 'Слизь', emoji: '🟢', price: 10, tier: 0, shape: 'blob', color: 0x7fdc5a, accent: 0xb9f28f },
  scale: { id: 'scale', name: 'Чешуя', emoji: '🔶', price: 20, tier: 0, shape: 'scale', color: 0xff9d3c, accent: 0xffd9a3 },
  feather: { id: 'feather', name: 'Перо', emoji: '🪶', price: 28, tier: 0, shape: 'feather', color: 0xe8ecff, accent: 0xa9b6ff },

  // --- изделия мастерских ---
  elixir: { id: 'elixir', name: 'Эликсир', emoji: '⚗️', price: 78, tier: 1, shape: 'flask', color: 0x67d3ff, accent: 0xd8f3ff },
  amulet: { id: 'amulet', name: 'Амулет', emoji: '📿', price: 118, tier: 1, shape: 'amulet', color: 0xffc63f, accent: 0x8b5cf6 },
  charm: { id: 'charm', name: 'Оберег', emoji: '🪄', price: 158, tier: 1, shape: 'charm', color: 0xd7a3ff, accent: 0xfff0b8 },
  artifact: { id: 'artifact', name: 'Артефакт', emoji: '💎', price: 420, tier: 2, shape: 'gem', color: 0x63f0d8, accent: 0xffffff },
}

export const itemList = Object.values(ITEMS)

export function item(id) {
  const found = ITEMS[id]
  if (!found) throw new Error(`Неизвестный товар: ${id}`)
  return found
}

/** «2 ✨ Пыльца + 1 🟢 Слизь» — человекочитаемый список стоимости. */
export function describeCost(cost) {
  return Object.entries(cost)
    .map(([id, n]) => `${n} ${item(id).emoji} ${item(id).name}`)
    .join(' + ')
}
