/**
 * Единая планировка фермы в мировых координатах (плоскость XZ, Y — вверх).
 * И симуляция, и рендер берут позиции отсюда, поэтому клики всегда совпадают
 * с картинкой.
 */

export const PASTURE = {
  cols: 7,
  rows: 5,
  tile: 1.75,
  center: { x: 0, z: 1.2 },
}

export const pastureWidth = PASTURE.cols * PASTURE.tile
export const pastureDepth = PASTURE.rows * PASTURE.tile

/** Центр клетки по её индексу. */
export function tileCenter(index) {
  const col = index % PASTURE.cols
  const row = Math.floor(index / PASTURE.cols)
  return {
    x: PASTURE.center.x + (col - (PASTURE.cols - 1) / 2) * PASTURE.tile,
    z: PASTURE.center.z + (row - (PASTURE.rows - 1) / 2) * PASTURE.tile,
  }
}

export const tileCount = PASTURE.cols * PASTURE.rows

/** Границы выгона — за них существа не выходят. */
export const BOUNDS = {
  minX: PASTURE.center.x - pastureWidth / 2 - 0.3,
  maxX: PASTURE.center.x + pastureWidth / 2 + 0.3,
  minZ: PASTURE.center.z - pastureDepth / 2 - 0.3,
  maxZ: PASTURE.center.z + pastureDepth / 2 + 0.3,
}

export const SPOTS = {
  well: { x: -8.6, z: 3.4 },
  warehouse: { x: 8.8, z: 3.6 },
  nursery: { x: -8.6, z: -2.6 },
  cage: { x: 8.6, z: -2.4 },
  truck: { x: 9.4, z: 8.2 },
  market: { x: 26, z: 8.2 }, // за краем сцены — фургон туда уезжает
  sign: { x: -3.2, z: 8.4 },
}

/** Мастерские стоят рядком у верхнего края. */
export const FACTORY_SPOTS = {
  alchemy: { x: -7.2, z: -7.6 },
  jewelry: { x: -2.4, z: -7.6 },
  enchant: { x: 2.4, z: -7.6 },
  artifactory: { x: 7.2, z: -7.6 },
}

/** Точка, куда падает готовое изделие мастерской. */
export function factoryDropSpot(id) {
  const spot = FACTORY_SPOTS[id]
  return { x: spot.x, z: spot.z + 2.2 }
}

/** Откуда приходят тёмные твари. */
export const RAIDER_GATES = [
  { x: -13, z: -6 },
  { x: 13, z: -6 },
  { x: -13, z: 6 },
  { x: 13, z: 6 },
]
