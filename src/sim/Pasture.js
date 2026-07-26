import { tileCenter, tileCount } from '../data/layout.js'

export const TILE = { BARE: 'bare', GROWING: 'growing', READY: 'ready' }

/**
 * Выгон — сетка грядок. Игрок поливает сухую грядку, трава прорастает,
 * существо её съедает, и грядка снова становится сухой.
 */
export class Pasture {
  constructor() {
    this.tiles = Array.from({ length: tileCount }, (_, i) => {
      const { x, z } = tileCenter(i)
      return { index: i, x, z, state: TILE.BARE, growth: 0, claimedBy: null, trampled: 0 }
    })
  }

  tile(index) {
    return this.tiles[index]
  }

  /** Полить сухую грядку. Возвращает true, если полив удался. */
  plant(index) {
    const t = this.tiles[index]
    if (!t || t.state !== TILE.BARE) return false
    t.state = TILE.GROWING
    t.growth = 0
    return true
  }

  update(dt, rate) {
    for (const t of this.tiles) {
      if (t.state === TILE.GROWING) {
        t.growth += rate * dt
        if (t.growth >= 1) {
          t.growth = 1
          t.state = TILE.READY
        }
      }
      if (t.trampled > 0) t.trampled = Math.max(0, t.trampled - dt)
    }
  }

  /** Ближайшая готовая и никем не занятая грядка. */
  findFood(x, z, forId) {
    let best = null
    let bestDist = Infinity
    for (const t of this.tiles) {
      if (t.state !== TILE.READY) continue
      if (t.claimedBy && t.claimedBy !== forId) continue
      const d = (t.x - x) ** 2 + (t.z - z) ** 2
      if (d < bestDist) {
        bestDist = d
        best = t
      }
    }
    return best
  }

  /** Любая готовая грядка — тёмным тварям всё равно, занята она или нет. */
  findAnyReady(x, z) {
    let best = null
    let bestDist = Infinity
    for (const t of this.tiles) {
      if (t.state !== TILE.READY) continue
      const d = (t.x - x) ** 2 + (t.z - z) ** 2
      if (d < bestDist) {
        bestDist = d
        best = t
      }
    }
    return best
  }

  claim(tile, id) {
    if (tile) tile.claimedBy = id
  }

  release(tile, id) {
    if (tile && tile.claimedBy === id) tile.claimedBy = null
  }

  /** Съесть/вытоптать траву. */
  consume(tile) {
    if (!tile || tile.state !== TILE.READY) return false
    tile.state = TILE.BARE
    tile.growth = 0
    tile.claimedBy = null
    tile.trampled = 1.2
    return true
  }

  get readyCount() {
    let n = 0
    for (const t of this.tiles) if (t.state === TILE.READY) n++
    return n
  }

  get growingCount() {
    let n = 0
    for (const t of this.tiles) if (t.state === TILE.GROWING) n++
    return n
  }
}
