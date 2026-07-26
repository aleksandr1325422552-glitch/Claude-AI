import { BOUNDS } from '../data/layout.js'
import { angleDelta, clamp, nextId } from '../core/util.js'
import { species as speciesDef } from '../data/species.js'

export const STAGE = { BABY: 'baby', ADULT: 'adult' }

/** Состояния поведения. */
export const CSTATE = {
  IDLE: 'idle', // хочет есть, но травы нет — гуляет и голодает
  SEEK: 'seek', // идёт к занятой грядке
  EAT: 'eat', // жуёт
  WORK: 'work', // сыт: переваривает и готовит товар
  FAINT: 'faint', // упал от голода, вот-вот исчезнет
}

const ARRIVE = 0.34
const EAT_TIME = 1.15
const BABY_DIGEST = 5.5
const STARVE_TIME = 78
const BREED_REST = 26

export class Creature {
  constructor(speciesId, stage = STAGE.BABY, x = 0, z = 0) {
    this.id = nextId('cr')
    this.speciesId = speciesId
    this.def = speciesDef(speciesId)
    this.stage = stage

    this.x = x
    this.z = z
    this.heading = Math.random() * Math.PI * 2
    this.speed = this.def.speed

    this.state = CSTATE.IDLE
    this.satiety = 0
    this.hunger = 0
    this.meals = 0
    this.eatTimer = 0
    this.productIndex = 0
    this.breedCooldown = stage === STAGE.ADULT ? 0 : BREED_REST
    this.faintTimer = 0

    this.targetTile = null
    this.wanderX = x
    this.wanderZ = z
    this.wanderPause = 0

    // Только для анимации: сглаженная скорость и фаза шага.
    this.animPhase = Math.random() * Math.PI * 2
    this.moveSpeed = 0
    this.justAte = 0
    this.justMade = 0
  }

  get isAdult() {
    return this.stage === STAGE.ADULT
  }

  get canBreed() {
    return this.isAdult && this.breedCooldown <= 0 && this.state !== CSTATE.FAINT
  }

  /** 0..1 — насколько существо близко к обмороку. */
  get starvation() {
    return clamp(this.hunger / STARVE_TIME, 0, 1)
  }

  /** 0..1 — готовность товара (только для взрослых). */
  get progress() {
    if (!this.isAdult || this.satiety <= 0) return 0
    return clamp(1 - this.satiety / this.def.produceTime, 0, 1)
  }

  get wantsFood() {
    return this.state === CSTATE.IDLE || this.state === CSTATE.SEEK
  }

  /** Какой товар выпадет следующим (у гибридов товары чередуются). */
  peekProduct() {
    const list = this.def.products
    return list[this.productIndex % list.length]
  }

  markBred() {
    this.breedCooldown = BREED_REST
  }

  // -------------------------------------------------------------------------

  update(dt, ctx) {
    if (this.breedCooldown > 0) this.breedCooldown -= dt
    if (this.justAte > 0) this.justAte -= dt
    if (this.justMade > 0) this.justMade -= dt

    if (this.state === CSTATE.FAINT) {
      this.faintTimer -= dt
      this.moveSpeed = 0
      if (this.faintTimer <= 0) ctx.onFaint(this)
      return
    }

    if (this.satiety > 0) {
      this.satiety -= dt
      if (this.satiety <= 0) {
        this.satiety = 0
        this.finishSatiety(ctx)
      }
    }

    switch (this.state) {
      case CSTATE.EAT:
        this.tickEat(dt, ctx)
        break
      case CSTATE.SEEK:
        this.tickSeek(dt, ctx)
        break
      case CSTATE.WORK:
        this.tickWander(dt, 0.45)
        break
      default:
        this.tickIdle(dt, ctx)
        break
    }

    this.animPhase += dt * (2.5 + this.moveSpeed * 3.4)
  }

  /** Сытость кончилась: взрослый роняет товар, малыш просто снова голоден. */
  finishSatiety(ctx) {
    if (this.state === CSTATE.EAT) return
    if (this.isAdult) {
      const product = this.peekProduct()
      this.productIndex++
      this.justMade = 0.9
      ctx.onProduce(this, product)
    }
    this.state = CSTATE.IDLE
  }

  tickIdle(dt, ctx) {
    const tile = ctx.pasture.findFood(this.x, this.z, this.id)
    if (tile) {
      ctx.pasture.claim(tile, this.id)
      this.targetTile = tile
      this.state = CSTATE.SEEK
      this.hunger = Math.max(0, this.hunger - dt * 2)
      return
    }
    this.hunger += dt
    if (this.hunger >= STARVE_TIME) {
      this.state = CSTATE.FAINT
      this.faintTimer = 2.4
      ctx.onStarve(this)
      return
    }
    this.tickWander(dt, 0.6)
  }

  tickSeek(dt, ctx) {
    const tile = this.targetTile
    // Пока шли, грядку могли съесть или вытоптать.
    if (!tile || tile.state !== 'ready') {
      ctx.pasture.release(tile, this.id)
      this.targetTile = null
      this.state = CSTATE.IDLE
      return
    }
    const arrived = this.moveTowards(tile.x, tile.z, dt, 1)
    if (arrived) {
      this.state = CSTATE.EAT
      this.eatTimer = EAT_TIME
    }
  }

  tickEat(dt, ctx) {
    this.moveSpeed = 0
    this.eatTimer -= dt
    if (this.eatTimer > 0) return

    const tile = this.targetTile
    this.targetTile = null
    if (!ctx.pasture.consume(tile)) {
      this.state = CSTATE.IDLE
      return
    }

    this.hunger = 0
    this.justAte = 0.8
    ctx.onEat(this)

    if (this.isAdult) {
      this.satiety = this.def.produceTime
      this.state = CSTATE.WORK
    } else {
      this.meals++
      if (this.meals >= this.def.mealsToGrow) {
        this.stage = STAGE.ADULT
        this.meals = 0
        this.breedCooldown = Math.max(this.breedCooldown, 6)
        ctx.onGrow(this)
        this.satiety = this.def.produceTime
        this.state = CSTATE.WORK
      } else {
        this.satiety = BABY_DIGEST
        this.state = CSTATE.WORK
      }
    }
  }

  /** Неспешная прогулка по выгону. */
  tickWander(dt, speedScale) {
    if (this.wanderPause > 0) {
      this.wanderPause -= dt
      this.moveSpeed *= 0.86
      return
    }
    const dx = this.wanderX - this.x
    const dz = this.wanderZ - this.z
    if (dx * dx + dz * dz < 0.2) {
      this.wanderX = BOUNDS.minX + Math.random() * (BOUNDS.maxX - BOUNDS.minX)
      this.wanderZ = BOUNDS.minZ + Math.random() * (BOUNDS.maxZ - BOUNDS.minZ)
      this.wanderPause = 0.6 + Math.random() * 2.2
      return
    }
    this.moveTowards(this.wanderX, this.wanderZ, dt, speedScale)
  }

  /** Шаг к точке. Возвращает true, если дошли. */
  moveTowards(tx, tz, dt, speedScale) {
    const dx = tx - this.x
    const dz = tz - this.z
    const dist = Math.hypot(dx, dz)
    if (dist < ARRIVE) {
      this.moveSpeed *= 0.8
      return true
    }
    const step = this.speed * speedScale * dt
    const k = Math.min(1, step / dist)
    this.x += dx * k
    this.z += dz * k
    this.x = clamp(this.x, BOUNDS.minX, BOUNDS.maxX)
    this.z = clamp(this.z, BOUNDS.minZ, BOUNDS.maxZ)

    const want = Math.atan2(dx, dz)
    this.heading += angleDelta(this.heading, want) * Math.min(1, dt * 9)
    this.moveSpeed = this.speed * speedScale
    return false
  }
}
