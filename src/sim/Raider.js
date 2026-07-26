import { angleDelta, clamp, nextId } from '../core/util.js'
import { PASTURE, RAIDER_GATES, SPOTS } from '../data/layout.js'

export const RSTATE = {
  WALK: 'walk', // идёт к цели
  EAT: 'eat', // топчет траву
  FLEE: 'flee', // убегает за край карты
  TRAPPED: 'trapped', // поймана, летит в клетку
  STUN: 'stun', // получила по морде, но клетка была полна
}

const EAT_TIME = 1.6
const SPEED = 2.05
const FLEE_SPEED = 3.6
const MAX_MEALS = 3

/**
 * Тёмная тварь. Приходит из леса, топчет траву, может украсть товар с земли.
 * Гибнет не от урона, а от кликов: сбив её здоровье, вы отправляете её в клетку.
 */
export class Raider {
  constructor(hp, gateIndex = Math.floor(Math.random() * RAIDER_GATES.length)) {
    const gate = RAIDER_GATES[gateIndex]
    this.id = nextId('rd')
    this.maxHp = hp
    this.hp = hp
    this.x = gate.x
    this.z = gate.z
    this.heading = Math.atan2(-gate.x, -gate.z)
    this.state = RSTATE.WALK
    this.targetTile = null
    this.targetDrop = null
    this.carrying = null
    this.timer = 0
    this.meals = 0
    this.flash = 0
    this.animPhase = Math.random() * Math.PI * 2
    this.moveSpeed = 0
    this.done = false
  }

  get isCatchable() {
    return this.state === RSTATE.WALK || this.state === RSTATE.EAT || this.state === RSTATE.STUN
  }

  /** Клик по твари. Возвращает 'hit' | 'caught' | 'blocked' | 'miss'. */
  hit(cageHasRoom) {
    if (!this.isCatchable) return 'miss'
    this.hp--
    this.flash = 0.35
    if (this.hp > 0) return 'hit'
    if (!cageHasRoom) {
      this.hp = 1
      this.state = RSTATE.STUN
      this.timer = 3.2
      return 'blocked'
    }
    this.state = RSTATE.TRAPPED
    this.timer = 0.9
    return 'caught'
  }

  update(dt, ctx) {
    if (this.flash > 0) this.flash -= dt
    this.animPhase += dt * (3 + this.moveSpeed * 2.5)

    switch (this.state) {
      case RSTATE.STUN:
        this.moveSpeed = 0
        this.timer -= dt
        if (this.timer <= 0) this.state = RSTATE.WALK
        break

      case RSTATE.TRAPPED: {
        this.timer -= dt
        const t = clamp(1 - this.timer / 0.9, 0, 1)
        this.x += (SPOTS.cage.x - this.x) * Math.min(1, dt * 6)
        this.z += (SPOTS.cage.z - this.z) * Math.min(1, dt * 6)
        if (t >= 1) {
          this.done = true
          ctx.onCaged(this)
        }
        break
      }

      case RSTATE.EAT:
        this.moveSpeed = 0
        this.timer -= dt
        if (this.timer <= 0) {
          ctx.pasture.consume(this.targetTile)
          ctx.onTrample(this, this.targetTile)
          this.targetTile = null
          this.meals++
          this.state = RSTATE.WALK
        }
        break

      case RSTATE.FLEE: {
        const away = this.x >= 0 ? 18 : -18
        this.moveTowards(away, this.z * 1.6, dt, FLEE_SPEED)
        if (Math.abs(this.x) > 16) {
          this.done = true
          ctx.onEscape(this)
        }
        break
      }

      default:
        this.tickWalk(dt, ctx)
        break
    }
  }

  tickWalk(dt, ctx) {
    // Лежащий товар привлекательнее травы.
    if (!this.targetDrop && !this.targetTile && ctx.drops.length && Math.random() < 0.5) {
      this.targetDrop = ctx.nearestDrop(this.x, this.z)
    }

    if (this.targetDrop) {
      if (!ctx.dropExists(this.targetDrop)) {
        this.targetDrop = null
      } else if (this.moveTowards(this.targetDrop.x, this.targetDrop.z, dt, SPEED)) {
        this.carrying = this.targetDrop.itemId
        ctx.onSteal(this, this.targetDrop)
        this.targetDrop = null
        this.state = RSTATE.FLEE
        return
      } else {
        return
      }
    }

    if (this.meals >= MAX_MEALS) {
      this.state = RSTATE.FLEE
      return
    }

    if (!this.targetTile || this.targetTile.state !== 'ready') {
      this.targetTile = ctx.pasture.findAnyReady(this.x, this.z)
    }

    if (this.targetTile) {
      if (this.moveTowards(this.targetTile.x, this.targetTile.z, dt, SPEED)) {
        this.state = RSTATE.EAT
        this.timer = EAT_TIME
      }
      return
    }

    // Ни травы, ни товара — потоптаться у выгона и уйти.
    this.timer += dt
    this.moveTowards(PASTURE.center.x, PASTURE.center.z, dt, SPEED * 0.6)
    if (this.timer > 9) this.state = RSTATE.FLEE
  }

  moveTowards(tx, tz, dt, speed) {
    const dx = tx - this.x
    const dz = tz - this.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.4) {
      this.moveSpeed *= 0.7
      return true
    }
    const k = Math.min(1, (speed * dt) / dist)
    this.x += dx * k
    this.z += dz * k
    this.heading += angleDelta(this.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 8)
    this.moveSpeed = speed
    return false
  }
}
