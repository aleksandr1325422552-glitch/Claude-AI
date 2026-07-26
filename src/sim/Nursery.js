import { nextId } from '../core/util.js'
import { offspringOf, isHybrid } from '../data/species.js'

/**
 * Питомник. Два взрослых существа кладутся в инкубатор: одинаковые виды
 * дают обычное яйцо, разные — гибрид, который наследует товары обоих.
 */
export class Nursery {
  constructor(slots = 2) {
    this.slots = slots
    this.eggs = []
  }

  get free() {
    return Math.max(0, this.slots - this.eggs.length)
  }

  /** Можно ли скрестить эту пару; возвращает {ok, reason, offspring}. */
  check(a, b) {
    if (!a || !b) return { ok: false, reason: 'Выберите двух существ' }
    if (a === b) return { ok: false, reason: 'Нужны два разных существа' }
    if (!a.isAdult || !b.isAdult) return { ok: false, reason: 'Оба должны быть взрослыми' }
    if (a.breedCooldown > 0 || b.breedCooldown > 0) return { ok: false, reason: 'Родители ещё отдыхают' }
    if (this.free <= 0) return { ok: false, reason: 'В инкубаторе нет места' }
    const offspring = offspringOf(a.speciesId, b.speciesId)
    return { ok: true, offspring }
  }

  /** Запускает инкубацию. `hatchMul` — множитель от улучшений. */
  start(a, b, hatchMul = 1) {
    const verdict = this.check(a, b)
    if (!verdict.ok) return verdict

    const offspring = verdict.offspring
    const total = offspring.hatchTime * hatchMul
    const egg = {
      id: nextId('egg'),
      offspringId: offspring.id,
      hybrid: isHybrid(offspring.id),
      parents: [a.id, b.id],
      parentSpecies: [a.speciesId, b.speciesId],
      timer: total,
      total,
    }
    this.eggs.push(egg)
    a.markBred()
    b.markBred()
    return { ok: true, egg, offspring }
  }

  /** Купленное на рынке яйцо кладётся в инкубатор так же. */
  addPurchased(speciesDefinition, hatchMul = 1) {
    if (this.free <= 0) return null
    const total = speciesDefinition.hatchTime * hatchMul
    const egg = {
      id: nextId('egg'),
      offspringId: speciesDefinition.id,
      hybrid: isHybrid(speciesDefinition.id),
      parents: [],
      parentSpecies: [],
      timer: total,
      total,
    }
    this.eggs.push(egg)
    return egg
  }

  update(dt, ctx) {
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const egg = this.eggs[i]
      egg.timer -= dt
      if (egg.timer <= 0) {
        this.eggs.splice(i, 1)
        ctx.onHatch(egg)
      }
    }
  }
}
