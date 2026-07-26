/**
 * Виды обитателей фермы: три девушки и три монстра.
 *
 * `mealsToGrow` — сколько раз малыш должен поесть, чтобы стать взрослым.
 * Взрослый съедает одну траву и через `produceTime` роняет товар.
 *
 * Гибриды (см. `hybridOf`) создаются в питомнике из двух разных видов и дают
 * товары обоих родителей по очереди — за это их и разводят.
 */

import { ITEMS } from './items.js'

export const KIND = { GIRL: 'girl', MONSTER: 'monster' }

export const SPECIES = {
  fairy: {
    id: 'fairy',
    kind: KIND.GIRL,
    name: 'Фея',
    plural: ['фея', 'феи', 'фей'],
    emoji: '🧚',
    model: 'fairy',
    products: ['pollen'],
    produceTime: 13,
    mealsToGrow: 2,
    hatchTime: 10,
    eggPrice: 90,
    adultPrice: 240,
    speed: 1.5,
    scale: 1,
    palette: { skin: 0xf6d4b8, hair: 0xffc0e0, dress: 0x5fd8a8, trim: 0xfff2a8, wing: 0x8fe0ff, eye: 0x3b2a4a },
    blurb: 'Быстрая и неприхотливая. Пыльца — основа любой алхимии.',
  },
  mermaid: {
    id: 'mermaid',
    kind: KIND.GIRL,
    name: 'Русалка',
    plural: ['русалка', 'русалки', 'русалок'],
    emoji: '🧜',
    model: 'mermaid',
    products: ['pearl'],
    produceTime: 17,
    mealsToGrow: 2,
    hatchTime: 13,
    eggPrice: 150,
    adultPrice: 380,
    speed: 1.15,
    scale: 1.02,
    palette: { skin: 0xf2d2bd, hair: 0x63e0d6, dress: 0x3aa7d8, trim: 0xbff3ff, wing: 0x9ee6ff, eye: 0x1e3a4a },
    blurb: 'Медленно ползает по траве, зато жемчуг дорог.',
  },
  witch: {
    id: 'witch',
    kind: KIND.GIRL,
    name: 'Ведьма',
    plural: ['ведьма', 'ведьмы', 'ведьм'],
    emoji: '🧙',
    model: 'witch',
    products: ['essence'],
    produceTime: 21,
    mealsToGrow: 3,
    hatchTime: 16,
    eggPrice: 260,
    adultPrice: 620,
    speed: 1.35,
    scale: 1.05,
    palette: { skin: 0xf0cfb6, hair: 0x4a2f6b, dress: 0x6d3fd6, trim: 0xffc63f, wing: 0x2b1b45, eye: 0x2a1b3a },
    blurb: 'Варит эссенцию — без неё не сделать оберег.',
  },

  slime: {
    id: 'slime',
    kind: KIND.MONSTER,
    name: 'Слизень',
    plural: ['слизень', 'слизня', 'слизней'],
    emoji: '🟢',
    model: 'slime',
    products: ['slime'],
    produceTime: 11,
    mealsToGrow: 2,
    hatchTime: 8,
    eggPrice: 70,
    adultPrice: 190,
    speed: 0.95,
    scale: 0.9,
    palette: { body: 0x7fdc5a, belly: 0xc4f59c, horn: 0x4f9c31, eye: 0x1b3410 },
    blurb: 'Самый дешёвый работник фермы. Ест всё, что растёт.',
  },
  dragonling: {
    id: 'dragonling',
    kind: KIND.MONSTER,
    name: 'Дракончик',
    plural: ['дракончик', 'дракончика', 'дракончиков'],
    emoji: '🐲',
    model: 'dragonling',
    products: ['scale'],
    produceTime: 19,
    mealsToGrow: 2,
    hatchTime: 15,
    eggPrice: 200,
    adultPrice: 500,
    speed: 1.6,
    scale: 1,
    palette: { body: 0xef7a3c, belly: 0xffd9a3, horn: 0xfff0c9, eye: 0x3a1405, wing: 0xc9502a },
    blurb: 'Носится по лугу и роняет чешую — сырьё для амулетов.',
  },
  gryphon: {
    id: 'gryphon',
    kind: KIND.MONSTER,
    name: 'Грифон',
    plural: ['грифон', 'грифона', 'грифонов'],
    emoji: '🦅',
    model: 'gryphon',
    products: ['feather'],
    produceTime: 23,
    mealsToGrow: 3,
    hatchTime: 18,
    eggPrice: 320,
    adultPrice: 760,
    speed: 1.45,
    scale: 1.12,
    palette: { body: 0xd8c39a, belly: 0xf3e6c8, horn: 0xffc63f, eye: 0x3c2a12, wing: 0xb59a6a },
    blurb: 'Гордый и дорогой. Перья идут в самые ценные изделия.',
  },
}

export const speciesList = Object.values(SPECIES)

export function species(id) {
  if (id.startsWith(HYBRID_PREFIX)) return hybridFromKey(id)
  const found = SPECIES[id]
  if (!found) throw new Error(`Неизвестный вид: ${id}`)
  return found
}

// ===========================================================================
//                                  Гибриды
// ===========================================================================

export const HYBRID_PREFIX = 'hyb:'

/** Ключ гибрида не зависит от порядка родителей. */
export function hybridKey(idA, idB) {
  const [a, b] = [baseIdOf(idA), baseIdOf(idB)].sort()
  return `${HYBRID_PREFIX}${a}+${b}`
}

export const isHybrid = (id) => typeof id === 'string' && id.startsWith(HYBRID_PREFIX)

/** Гибрид гибрида наследует «чистую» основу — иначе ключи расползутся. */
function baseIdOf(id) {
  if (!isHybrid(id)) return id
  return parentsOfKey(id)[0]
}

export function parentsOfKey(key) {
  return key.slice(HYBRID_PREFIX.length).split('+')
}

/** Красивые имена для самых частых пар; остальные получают общее «Химера». */
const HYBRID_NAMES = {
  'dragonling+fairy': 'Драконья фея',
  'fairy+slime': 'Слизнефея',
  'fairy+mermaid': 'Морская фея',
  'fairy+gryphon': 'Пернатая фея',
  'fairy+witch': 'Фея-чародейка',
  'mermaid+slime': 'Слизневая русалка',
  'dragonling+mermaid': 'Драконья русалка',
  'gryphon+mermaid': 'Пернатая русалка',
  'mermaid+witch': 'Морская чародейка',
  'slime+witch': 'Слизневая ведьма',
  'dragonling+witch': 'Драконья ведьма',
  'gryphon+witch': 'Ведьма-грифон',
  'dragonling+slime': 'Слизнедракон',
  'gryphon+slime': 'Слизнегриф',
  'dragonling+gryphon': 'Драконий грифон',
}

const hybridCache = new Map()

/** Собирает определение гибрида из двух видов. Результат кэшируется. */
export function hybridOf(idA, idB) {
  return hybridFromKey(hybridKey(idA, idB))
}

export function hybridFromKey(key) {
  const cached = hybridCache.get(key)
  if (cached) return cached

  const [aId, bId] = parentsOfKey(key)
  const a = SPECIES[aId]
  const b = SPECIES[bId]
  if (!a || !b) throw new Error(`Неизвестный гибрид: ${key}`)

  // Носитель облика — «девушка», если она есть в паре: она даёт основу модели,
  // а второй родитель добавляет черты (рога, крылья, хвост).
  const host = a.kind === KIND.GIRL ? a : b.kind === KIND.GIRL ? b : a
  const guest = host === a ? b : a

  const def = {
    id: key,
    key,
    hybrid: true,
    kind: host.kind,
    parents: [a.id, b.id],
    name: HYBRID_NAMES[`${a.id}+${b.id}`] ?? `Химера (${a.name} × ${b.name})`,
    plural: ['гибрид', 'гибрида', 'гибридов'],
    emoji: '🧬',
    model: host.model,
    graftModel: guest.model,
    // Главное преимущество: два разных товара по очереди.
    products: [...new Set([...a.products, ...b.products])],
    produceTime: ((a.produceTime + b.produceTime) / 2) * 0.85,
    mealsToGrow: Math.max(a.mealsToGrow, b.mealsToGrow),
    hatchTime: (a.hatchTime + b.hatchTime) * 0.8,
    eggPrice: Math.round((a.eggPrice + b.eggPrice) * 0.9),
    adultPrice: Math.round((a.adultPrice + b.adultPrice) * 0.8),
    speed: (a.speed + b.speed) / 2,
    scale: Math.max(a.scale, b.scale) * 1.04,
    palette: mixPalette(host.palette, guest.palette),
    blurb: `Даёт по очереди ${[...new Set([...a.products, ...b.products])]
      .map((p) => ITEMS[p].name.toLowerCase())
      .join(' и ')}. Работает быстрее родителей.`,
  }

  hybridCache.set(key, def)
  return def
}

function mixPalette(host, guest) {
  const out = { ...host }
  // Гостевые части (рога, крылья, тело) окрашиваются в цвет второго родителя.
  out.graft = guest.body ?? guest.dress ?? 0xcccccc
  out.graftAccent = guest.horn ?? guest.trim ?? guest.belly ?? 0xffffff
  return out
}

/**
 * Что получится при скрещивании: одинаковые виды дают обычное яйцо,
 * разные — гибрид.
 */
export function offspringOf(idA, idB) {
  if (baseIdOf(idA) === baseIdOf(idB)) return species(baseIdOf(idA))
  return hybridOf(idA, idB)
}
