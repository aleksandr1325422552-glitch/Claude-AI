import { $, clear, el } from './dom.js'
import { ITEMS, item } from '../data/items.js'
import { formatNumber, formatTime } from '../core/util.js'
import { CSTATE } from '../sim/Creature.js'
import { FSTATE } from '../sim/Factory.js'
import { isHybrid } from '../data/species.js'

/**
 * Верхняя, нижняя панель и подсказки. Каждый кадр сверяет значения с ферм­ой
 * и переписывает только то, что изменилось.
 */
export class Hud {
  constructor(farm, actions) {
    this.farm = farm
    this.actions = actions

    this.nodes = {
      coins: $('#ui-coins'),
      water: $('#ui-water'),
      waterMax: $('#ui-water-max'),
      waterPill: $('#ui-water-pill'),
      store: $('#ui-store'),
      storeMax: $('#ui-store-max'),
      storePill: $('#ui-store-pill'),
      cage: $('#ui-cage'),
      cageMax: $('#ui-cage-max'),
      cagePill: $('#ui-cage-pill'),
      goals: $('#ui-goals'),
      timer: $('#ui-timer'),
      timerPill: $('#ui-timer-pill'),
      storeSlots: $('#ui-store-slots'),
      truckSlots: $('#ui-truck-slots'),
      truckState: $('#ui-truck-state'),
      sendBtn: $('#btn-send-truck'),
      toasts: $('#toasts'),
      tooltip: $('#tooltip'),
      nurseryBtn: $('#btn-nursery'),
    }

    this.cache = {}
    this.nodes.cagePill.classList.add('is-clickable')
    this.nodes.cagePill.addEventListener('click', () => this.actions.sellCage())
    this.nodes.sendBtn.addEventListener('click', () => this.actions.sendTruck())
  }

  setFarm(farm) {
    this.farm = farm
    this.cache = {}
  }

  // -------------------------------------------------------------------------

  update() {
    const f = this.farm
    this.#text('coins', formatNumber(f.coins))
    this.#text('water', Math.floor(f.can.water))
    this.#text('waterMax', f.can.max)
    this.#text('store', f.warehouse.count)
    this.#text('storeMax', f.warehouse.capacity)
    this.#text('cage', f.cage.count)
    this.#text('cageMax', f.cage.capacity)
    this.#text('timer', formatTime(f.timeLeft))

    this.nodes.timerPill.classList.toggle('is-alarm', f.timeLeft <= 30)
    this.nodes.storePill.classList.toggle('is-alarm', f.warehouse.isFull)
    this.nodes.waterPill.classList.toggle('is-alarm', f.can.water < 1 && f.pasture.readyCount === 0)
    this.nodes.cagePill.classList.toggle('is-alarm', f.cage.count >= f.cage.capacity)
    this.nodes.nurseryBtn.classList.toggle('is-hot', f.nursery.eggs.length > 0)

    this.#updateGoals()
    this.#updateSlots()
    this.#updateTruck()
  }

  #text(key, value) {
    const str = String(value)
    if (this.cache[key] === str) return
    this.cache[key] = str
    this.nodes[key].textContent = str
    // Монеты подпрыгивают при изменении
    if (key === 'coins') {
      const pill = this.nodes.coins.parentElement
      pill.classList.remove('is-bump')
      void pill.offsetWidth
      pill.classList.add('is-bump')
    }
  }

  #updateGoals() {
    const goals = this.farm.goalState()
    const key = goals.map((g) => `${g.key}${g.have}/${g.need}${g.done ? '!' : ''}`).join('|')
    if (this.cache.goals === key) return
    this.cache.goals = key

    clear(this.nodes.goals)
    for (const goal of goals) {
      this.nodes.goals.append(
        el(
          'div',
          { class: `goal${goal.done ? ' is-done' : ''}`, title: goal.title },
          el('span', { class: 'goal__icon', text: goal.icon }),
          el('span', { text: `${Math.min(goal.have, goal.need)}/${goal.need}` }),
        ),
      )
    }
  }

  #updateSlots() {
    const f = this.farm
    const entries = f.warehouse.entries()
    const key = entries.map((e) => `${e.item.id}:${e.count}:${f.market.priceOf(e.item.id)}`).join(',') + `|${f.truck.isIdle}`
    if (this.cache.slots === key) return
    this.cache.slots = key

    clear(this.nodes.storeSlots)
    const total = Math.max(entries.length, 4)
    for (let i = 0; i < total; i++) {
      const entry = entries[i]
      if (!entry) {
        this.nodes.storeSlots.append(el('div', { class: 'slot' }))
        continue
      }
      const price = f.market.priceOf(entry.item.id)
      const slot = el(
        'div',
        {
          class: 'slot slot--filled',
          title: `${entry.item.name} — ${price} монет. Клик: положить в фургон`,
          onclick: () => this.actions.loadTruck(entry.item.id),
        },
        el('span', { text: entry.item.emoji }),
        el('span', { class: 'slot__count', text: entry.count }),
        el('span', { class: 'slot__price', text: price }),
      )
      this.nodes.storeSlots.append(slot)
    }
  }

  #updateTruck() {
    const truck = this.farm.truck
    const cargo = [...truck.cargo.entries()]
    const key = `${truck.state}|${cargo.map(([id, n]) => id + n).join(',')}|${Math.ceil(truck.timer)}|${truck.capacity}`
    if (this.cache.truck === key) return
    this.cache.truck = key

    clear(this.nodes.truckSlots)
    const flat = cargo.flatMap(([id, n]) => Array(n).fill(id))
    for (let i = 0; i < truck.capacity; i++) {
      const id = flat[i]
      if (!id) {
        this.nodes.truckSlots.append(el('div', { class: 'slot' }))
        continue
      }
      this.nodes.truckSlots.append(
        el(
          'div',
          {
            class: 'slot slot--filled',
            title: `${item(id).name} — клик: вернуть на склад`,
            onclick: () => this.actions.unloadTruck(id),
          },
          el('span', { text: item(id).emoji }),
        ),
      )
    }

    if (truck.state === 'away') {
      const half = truck.tripTime / 2
      this.nodes.truckState.textContent = truck.timer > half ? 'едет на рынок…' : 'возвращается…'
    } else {
      this.nodes.truckState.textContent = truck.load ? `${truck.load}/${truck.capacity} — можно ехать` : `пусто (${truck.capacity} мест)`
    }

    this.nodes.sendBtn.disabled = !truck.isIdle || truck.load === 0
    this.nodes.sendBtn.textContent = truck.isIdle ? 'Отправить на рынок' : 'В пути…'
  }

  // ------------------------------------------------------------- сообщения --

  toast(text, kind = '') {
    const node = el('div', { class: `toast${kind ? ` toast--${kind}` : ''}`, text })
    this.nodes.toasts.append(node)
    setTimeout(() => node.remove(), 2400)
    // Больше пяти сообщений одновременно не показываем.
    while (this.nodes.toasts.children.length > 5) this.nodes.toasts.firstChild.remove()
  }

  // -------------------------------------------------------------- подсказки -

  showTooltip(html, clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return
    const tip = this.nodes.tooltip
    tip.innerHTML = html
    tip.hidden = false
    const pad = 14
    const rect = tip.getBoundingClientRect()
    let x = clientX + pad
    let y = clientY + pad
    if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad
    if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - pad
    tip.style.left = `${Math.max(6, x)}px`
    tip.style.top = `${Math.max(6, y)}px`
  }

  hideTooltip() {
    this.nodes.tooltip.hidden = true
  }

  /** Текст подсказки для объекта под курсором. */
  tooltipFor(hit) {
    const f = this.farm
    switch (hit.kind) {
      case 'well':
        return `<b>Колодец</b><br>Вода: ${Math.floor(f.well.water)}/${f.well.max}<br>Клик — набрать в лейку (${Math.floor(f.can.water)}/${f.can.max})`

      case 'tile': {
        const tile = f.pasture.tile(hit.index)
        if (tile.state === 'ready') return '<b>Трава готова</b><br>Кто-нибудь придёт и поест'
        if (tile.state === 'growing') return `<b>Растёт</b> — ${Math.round(tile.growth * 100)}%`
        return f.can.water >= 1 ? '<b>Сухая грядка</b><br>Клик — посеять и полить' : '<b>Сухая грядка</b><br>Нужна вода — наберите её в колодце'
      }

      case 'creature': {
        const c = f.creatures.find((x) => x.id === hit.id)
        if (!c) return ''
        const products = c.def.products.map((p) => `${ITEMS[p].emoji} ${ITEMS[p].name}`).join(', ')
        const lines = [`<b>${c.def.name}</b>${isHybrid(c.speciesId) ? ' 🧬' : ''}`]
        lines.push(c.isAdult ? 'Взрослая' : `Малыш — поел ${c.meals}/${c.def.mealsToGrow}`)
        lines.push(`Даёт: ${products}`)
        if (c.state === CSTATE.FAINT) lines.push('<span style="color:#ff9b8b">Упала от голода</span>')
        else if (c.state === CSTATE.WORK && c.isAdult) lines.push(`Готовность: ${Math.round(c.progress * 100)}%`)
        else if (c.wantsFood) lines.push(c.starvation > 0.4 ? '<span style="color:#ff9b8b">Очень голодна!</span>' : 'Ищет траву')
        if (c.isAdult) lines.push(c.breedCooldown > 0 ? `Отдых: ${Math.ceil(c.breedCooldown)} c` : 'Готова к скрещиванию')
        return lines.join('<br>')
      }

      case 'drop': {
        const it = item(hit.itemId)
        const drop = f.drops.find((d) => d.id === hit.id)
        const left = drop ? `<br>Пропадёт через ${Math.ceil(drop.life)} c` : ''
        return `<b>${it.emoji} ${it.name}</b><br>Цена: ${f.market.priceOf(it.id)} монет${left}<br>Клик — на склад`
      }

      case 'raider': {
        const r = f.raiders.find((x) => x.id === hit.id)
        return `<b>Тёмная тварь</b><br>Осталось ударов: ${r?.hp ?? 0}<br>Клик — бить!`
      }

      case 'cage':
        return `<b>Клетка</b> ${f.cage.count}/${f.cage.capacity}<br>Клик — продать в цирк по ${f.raiderCfg?.price ?? 100} монет`

      case 'warehouse':
        return `<b>Склад</b> ${f.warehouse.count}/${f.warehouse.capacity}<br>Товары показаны внизу экрана`

      case 'nursery': {
        const eggs = f.nursery.eggs
        const list = eggs.length
          ? eggs.map((e) => `• ${e.hybrid ? 'гибрид' : 'яйцо'} — ${Math.ceil(e.timer)} c`).join('<br>')
          : 'Пусто'
        return `<b>Питомник</b> (${eggs.length}/${f.nursery.slots})<br>${list}<br>Клик — скрестить существ`
      }

      case 'truck': {
        const t = f.truck
        return t.isIdle
          ? `<b>Фургон</b> ${t.load}/${t.capacity}<br>Клик — отправить на рынок`
          : `<b>Фургон</b> в пути — ${Math.ceil(t.timer)} c`
      }

      case 'factory': {
        const factory = f.factories.get(hit.id)
        if (!factory) return ''
        const def = factory.def
        const inputs = Object.entries(def.input)
          .map(([id, n]) => `${n}${ITEMS[id].emoji}`)
          .join(' + ')
        const status = factory.statusText(f.warehouse)
        const progress = factory.state === FSTATE.WORKING ? `<br>Готово на ${Math.round(factory.progress * 100)}%` : ''
        return `<b>${def.emoji} ${def.name}</b><br>${inputs} → ${ITEMS[def.output].emoji} ${ITEMS[def.output].name}<br>${status}${progress}<br><i>Клик — вкл/выкл</i>`
      }

      default:
        return ''
    }
  }
}
