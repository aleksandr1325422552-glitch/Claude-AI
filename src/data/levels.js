/**
 * Кампания. Каждый уровень задаёт стартовое хозяйство, доступный ассортимент
 * рынка, набор целей и лимит времени.
 *
 * Виды целей:
 *   coins      — иметь столько монет на руках
 *   earned     — заработать столько за уровень
 *   produce    — собрать столько товаров за уровень (сырьё или изделия)
 *   creatures  — иметь столько взрослых существ данного вида
 *   hybrids    — иметь столько гибридов
 *   trap       — поймать столько тёмных тварей
 */

export const LEVELS = [
  {
    id: 'l1',
    name: 'Первое утро',
    story:
      'Бабушка оставила вам заброшенный луг, колодец и одну сонную фею. Полейте траву, накормите фею и соберите первую пыльцу.',
    time: 210,
    startCreatures: [{ species: 'fairy', stage: 'adult', count: 1 }],
    shopSpecies: ['fairy'],
    factories: [],
    buyableFactories: [],
    raiders: null,
    goals: { produce: { pollen: 4 }, earned: 120 },
    stars: [0.5, 0.78],
    tips: [
      'Кликните <b>колодец</b>, чтобы набрать воду в лейку.',
      'Кликните <b>сухую грядку</b>, чтобы посеять и полить траву.',
      'Фея сама придёт поесть, а через несколько секунд обронит пыльцу — <b>кликните</b> по ней.',
      'Товары со склада кликом отправляются в <b>фургон</b>, а фургон — на рынок.',
    ],
  },
  {
    id: 'l2',
    name: 'Зелёные соседи',
    story:
      'На ферме завелись слизни — существа глупые, но полезные. Из пыльцы и слизи алхимическая мастерская варит эликсир.',
    time: 270,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 2 },
      { species: 'slime', stage: 'adult', count: 1 },
    ],
    shopSpecies: ['fairy', 'slime'],
    factories: ['alchemy'],
    buyableFactories: [],
    raiders: null,
    goals: { produce: { elixir: 2 }, earned: 300 },
    stars: [0.52, 0.8],
    tips: [
      'Мастерская сама берёт сырьё со склада и выкладывает изделие рядом с собой.',
      'Готовый эликсир нужно <b>подобрать кликом</b> — иначе он пропадёт.',
      'Яйца новых существ покупаются на <b>Рынке</b>.',
    ],
  },
  {
    id: 'l3',
    name: 'Гости из чащи',
    story:
      'Из леса потянулись тёмные твари: они топчут траву и воруют товар. Бейте их кликами, а пойманных продавайте в бродячий цирк.',
    time: 270,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 2 },
      { species: 'slime', stage: 'adult', count: 2 },
    ],
    shopSpecies: ['fairy', 'slime'],
    factories: ['alchemy'],
    buyableFactories: [],
    raiders: { first: 25, interval: 30, hp: 3, price: 110 },
    goals: { trap: 3, earned: 600 },
    stars: [0.55, 0.82],
    tips: [
      'По твари нужно кликнуть несколько раз — счётчик над ней показывает остаток.',
      'Пойманные твари сидят в <b>клетке</b>. Кликните клетку, чтобы продать их в цирк.',
      'Если клетка полна, тварь не поймать — сначала освободите место.',
    ],
  },
  {
    id: 'l4',
    name: 'Русалочий пруд',
    story:
      'В пруду поселились русалки, а в скалах вылупились дракончики. Жемчуг и чешуя — сырьё для дорогих амулетов.',
    time: 330,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 2 },
      { species: 'slime', stage: 'adult', count: 1 },
      { species: 'mermaid', stage: 'adult', count: 1 },
    ],
    startItems: { pollen: 2 },
    shopSpecies: ['fairy', 'slime', 'mermaid', 'dragonling'],
    factories: ['alchemy', 'jewelry'],
    buyableFactories: [],
    raiders: { first: 35, interval: 34, hp: 3, price: 120 },
    goals: { produce: { amulet: 2 }, coins: 900 },
    stars: [0.56, 0.83],
    tips: [
      'Русалка ходит медленно — сейте траву поближе к ней.',
      'Цена на рынке падает, если возить один и тот же товар. Она восстанавливается со временем.',
    ],
  },
  {
    id: 'l5',
    name: 'Питомник',
    story:
      'Старый инкубатор снова работает. Скрестите двух разных существ — гибрид даёт товары обоих родителей и работает быстрее.',
    time: 330,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 2 },
      { species: 'slime', stage: 'adult', count: 2 },
      { species: 'dragonling', stage: 'adult', count: 1 },
    ],
    shopSpecies: ['fairy', 'slime', 'mermaid', 'dragonling'],
    factories: ['alchemy', 'jewelry'],
    buyableFactories: [],
    raiders: { first: 40, interval: 32, hp: 3, price: 120 },
    goals: { hybrids: 1, produce: { elixir: 4 } },
    stars: [0.58, 0.85],
    tips: [
      'Откройте <b>Питомник</b> и выберите двух взрослых существ.',
      'Одинаковые виды дают обычное яйцо, разные — <b>гибрид</b>.',
      'После скрещивания родителям нужен отдых.',
    ],
  },
  {
    id: 'l6',
    name: 'Ведьмин котёл',
    story:
      'На ферму пришли ведьма и грифон. Эссенция и перо превращаются в оберег — самый прибыльный товар из простых.',
    time: 360,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 2 },
      { species: 'slime', stage: 'adult', count: 2 },
      { species: 'witch', stage: 'adult', count: 1 },
      { species: 'gryphon', stage: 'adult', count: 1 },
    ],
    startItems: { essence: 1 },
    shopSpecies: ['fairy', 'slime', 'mermaid', 'dragonling', 'witch', 'gryphon'],
    factories: ['alchemy', 'jewelry', 'enchant'],
    buyableFactories: [],
    raiders: { first: 30, interval: 28, hp: 4, price: 130 },
    goals: { produce: { charm: 2 }, earned: 1200 },
    stars: [0.6, 0.86],
    tips: [
      'Грифон ест много, но перо стоит дорого.',
      'Следите за складом: если он полон, товар останется лежать на земле.',
    ],
  },
  {
    id: 'l7',
    name: 'Артефакт',
    story:
      'Заказ от королевской академии: один настоящий артефакт. Для него нужны и эликсир, и амулет — держите обе цепочки.',
    time: 390,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 3 },
      { species: 'slime', stage: 'adult', count: 2 },
      { species: 'mermaid', stage: 'adult', count: 2 },
      { species: 'dragonling', stage: 'adult', count: 1 },
    ],
    startItems: { pollen: 2, pearl: 2 },
    shopSpecies: ['fairy', 'slime', 'mermaid', 'dragonling', 'witch', 'gryphon'],
    factories: ['alchemy', 'jewelry', 'artifactory'],
    buyableFactories: ['enchant'],
    raiders: { first: 28, interval: 26, hp: 4, price: 140 },
    goals: { produce: { artifact: 1 }, earned: 1500 },
    stars: [0.62, 0.88],
    tips: [
      'Артефактной нужны готовые эликсир и амулет — не увозите их на рынок.',
      'Недостающую мастерскую можно <b>построить</b> на рынке.',
    ],
  },
  {
    id: 'l8',
    name: 'Ярмарка чудес',
    story:
      'Финал: большая ярмарка. Никаких особых заказов — только заработайте как можно больше и как можно быстрее.',
    time: 450,
    startCreatures: [
      { species: 'fairy', stage: 'adult', count: 3 },
      { species: 'slime', stage: 'adult', count: 2 },
      { species: 'mermaid', stage: 'adult', count: 2 },
      { species: 'witch', stage: 'adult', count: 1 },
      { species: 'gryphon', stage: 'adult', count: 1 },
    ],
    startItems: { pollen: 2, pearl: 2, essence: 1, feather: 1 },
    shopSpecies: ['fairy', 'slime', 'mermaid', 'dragonling', 'witch', 'gryphon'],
    factories: ['alchemy', 'jewelry', 'enchant', 'artifactory'],
    buyableFactories: [],
    raiders: { first: 24, interval: 22, hp: 4, price: 150 },
    goals: { earned: 4500 },
    stars: [0.66, 0.9],
    tips: [
      'Гибриды сильно ускоряют производство — заводите их заранее.',
      'Возите на рынок разные товары, чтобы цены не проседали.',
    ],
  },
]

export function levelAt(index) {
  return LEVELS[Math.max(0, Math.min(index, LEVELS.length - 1))]
}

/** Сколько звёзд заслужено за уровень, законченный за `usedFraction` времени. */
export function starsFor(level, usedFraction) {
  const [three, two] = level.stars
  if (usedFraction <= three) return 3
  if (usedFraction <= two) return 2
  return 1
}
