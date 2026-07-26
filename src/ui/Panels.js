import { $, clear, el } from './dom.js'
import { ITEMS } from '../data/items.js'
import { factoryList } from '../data/recipes.js'
import { LEVELS, starsFor } from '../data/levels.js'
import { upgradeCost, upgradeList } from '../data/upgrades.js'
import { KIND, isHybrid, species as speciesDef } from '../data/species.js'
import { formatNumber, formatTime, plural } from '../core/util.js'

/** Одно модальное окно на все случаи. */
export class Modal {
  constructor() {
    this.root = $('#modal')
    this.titleNode = $('#modal-title')
    this.bodyNode = $('#modal-body')
    this.footNode = $('#modal-foot')
    this.closeBtn = this.root.querySelector('.modal__x')
    this.onClose = null
    this.closable = true

    this.root.addEventListener('click', (e) => {
      if (e.target.dataset.close && this.closable) this.close()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.isOpen || !this.closable) return
      // Не даём тому же нажатию открыть меню паузы поверх закрытого окна.
      e.stopPropagation()
      this.close()
    })
  }

  get isOpen() {
    return !this.root.hidden
  }

  open({ title, body, foot = [], closable = true, onClose = null }) {
    this.titleNode.textContent = title
    clear(this.bodyNode)
    for (const part of [body].flat()) {
      if (!part) continue
      this.bodyNode.append(part instanceof Node ? part : el('div', { html: String(part) }))
    }
    clear(this.footNode)
    for (const button of foot) {
      if (!button) continue
      this.footNode.append(
        el('button', {
          class: `btn ${button.cls ?? ''}`,
          text: button.label,
          disabled: button.disabled,
          onclick: () => button.onClick?.(),
        }),
      )
    }
    this.closable = closable
    this.closeBtn.hidden = !closable
    this.onClose = onClose
    this.root.hidden = false
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    const cb = this.onClose
    this.onClose = null
    cb?.()
  }
}

// ===========================================================================

/** Все игровые окна: справка, рынок, питомник, хозяйство, лавка, итоги. */
export class Panels {
  constructor({ modal, actions }) {
    this.modal = modal
    this.actions = actions
    this.farm = null
    this.progress = null
  }

  bind(farm, progress) {
    this.farm = farm
    this.progress = progress
  }

  // ------------------------------------------------------------------ help --

  help() {
    const row = (icon, text) => el('div', { class: 'helprow' }, el('div', { text: icon }), el('div', { html: text }))
    this.modal.open({
      title: 'Как играть',
      body: [
        el(
          'div',
          { class: 'helplist' },
          row('⛲', 'Кликните <b>колодец</b> — вода наберётся в лейку.'),
          row('🌱', 'Кликните <b>сухую грядку</b> — потратится одна вода, вырастет трава.'),
          row('🧚', 'Существа сами приходят есть. Взрослые после еды роняют товар, малыши растут.'),
          row('✨', 'Кликните <b>товар на земле</b> — он попадёт на склад. Полежав, товар пропадает.'),
          row('⚗️', 'Мастерские сами берут сырьё со склада и выкладывают изделие рядом — его тоже нужно подобрать.'),
          row('🚚', 'Кликайте товары <b>на складе</b> (внизу), чтобы загрузить фургон, затем — «Отправить на рынок».'),
          row('🥚', '<b>Питомник</b>: два взрослых существа дают яйцо. Разные виды — <b>гибрид</b>, он даёт товары обоих родителей.'),
          row('👹', '<b>Тёмные твари</b> топчут траву и воруют товар. Бейте их кликами; пойманных продавайте в цирк, кликнув клетку.'),
          row('🛒', 'На <b>Рынке</b> покупаются яйца, готовые работники и новые мастерские.'),
          row('⏳', 'Успейте выполнить все цели до конца времени. Чем быстрее — тем больше звёзд.'),
        ),
        el('div', {
          class: 'note',
          html:
            'Управление камерой: <kbd>перетаскивание</kbd> — сдвинуть вид, <kbd>колесо</kbd> — приблизить.<br>' +
            'Горячие клавиши: <kbd>Space</kbd> пауза, <kbd>M</kbd> звук, <kbd>H</kbd> справка, <kbd>E</kbd> отправить фургон, ' +
            '<kbd>Q</kbd> набрать воду, <kbd>W</kbd> полить свободную грядку.',
        }),
      ],
      foot: [{ label: 'Понятно', cls: 'btn--plum', onClick: () => this.modal.close() }],
    })
  }

  // ---------------------------------------------------------------- market --

  market() {
    const render = (tab) => {
      const body = []
      body.push(
        el(
          'div',
          { class: 'tabs' },
          ...[
            ['eggs', '🥚 Яйца'],
            ['adults', '🧚 Готовые работники'],
            ['build', '🏠 Мастерские'],
          ].map(([id, label]) =>
            el('button', { class: `tab${tab === id ? ' is-active' : ''}`, text: label, onclick: () => render(id) }),
          ),
        ),
      )

      if (tab === 'eggs') {
        body.push(
          el('div', { class: 'note', html: `Яйцо попадает в питомник и вылупляется малышом. Свободных мест: <b>${this.farm.nursery.free}</b>.` }),
        )
        body.push(
          el(
            'div',
            { class: 'cards' },
            ...this.farm.shopSpecies.map((def) =>
              this.#speciesCard(def, def.eggPrice, 'Яйцо', () => {
                if (this.actions.buyEgg(def.id)) render(tab)
              }),
            ),
          ),
        )
      } else if (tab === 'adults') {
        body.push(el('div', { class: 'note', html: 'Взрослый работник начинает приносить товар сразу — но и стоит дороже.' }))
        body.push(
          el(
            'div',
            { class: 'cards' },
            ...this.farm.shopSpecies.map((def) =>
              this.#speciesCard(def, def.adultPrice, 'Взрослая', () => {
                if (this.actions.buyAdult(def.id)) render(tab)
              }),
            ),
          ),
        )
      } else {
        const buyable = this.farm.buyableFactories
        body.push(
          buyable.length
            ? el('div', { class: 'cards' }, ...buyable.map((def) => this.#factoryCard(def, () => {
                if (this.actions.buyFactory(def.id)) render(tab)
              })))
            : el('div', { class: 'note', text: 'На этом уровне строить нечего — все доступные мастерские уже стоят.' }),
        )
        body.push(el('h3', { text: 'Цепочки производства' }), this.#chains())
      }

      this.modal.open({
        title: `Рынок — у вас ${formatNumber(this.farm.coins)} 🪙`,
        body,
        foot: [{ label: 'Закрыть', cls: 'btn--ghost', onClick: () => this.modal.close() }],
      })
    }
    render('eggs')
  }

  #speciesCard(def, price, label, onBuy) {
    const affordable = this.farm.coins >= price
    return el(
      'div',
      { class: `card${affordable ? '' : ' card--locked'}` },
      el('div', { class: 'card__head' }, el('span', { class: 'card__emoji', text: def.emoji }), el(
        'div',
        {},
        el('div', { class: 'card__name', text: def.name }),
        el('div', { class: 'card__sub', text: def.kind === KIND.GIRL ? 'девушка' : 'монстр' }),
      )),
      el(
        'div',
        { class: 'card__body' },
        el('div', { class: 'card__row' }, el('span', { text: 'Даёт' }), el('span', { text: def.products.map((p) => ITEMS[p].emoji + ' ' + ITEMS[p].name).join(', ') })),
        el('div', { class: 'card__row' }, el('span', { text: 'Раз в' }), el('span', { text: `${Math.round(def.produceTime)} c` })),
        el('div', { class: 'card__row' }, el('span', { text: 'Ест до взросления' }), el('span', { text: `${def.mealsToGrow}×` })),
        el('div', { class: 'card__sub', text: def.blurb }),
      ),
      el('button', { class: 'btn btn--gold', text: `${label} — ${formatNumber(price)} 🪙`, disabled: !affordable, onclick: onBuy }),
    )
  }

  #factoryCard(def, onBuy) {
    const affordable = this.farm.coins >= def.price
    return el(
      'div',
      { class: `card${affordable ? '' : ' card--locked'}` },
      el('div', { class: 'card__head' }, el('span', { class: 'card__emoji', text: def.emoji }), el('div', { class: 'card__name', text: def.name })),
      el(
        'div',
        { class: 'card__body' },
        el('div', { class: 'chain' }, ...this.#chainNodes(def)),
        el('div', { class: 'card__row' }, el('span', { text: 'Время' }), el('span', { text: `${def.time} c` })),
        el('div', { class: 'card__row' }, el('span', { text: 'Цена изделия' }), el('span', { text: `${ITEMS[def.output].price} 🪙` })),
      ),
      el('button', { class: 'btn btn--gold', text: `Построить — ${def.price} 🪙`, disabled: !affordable, onclick: onBuy }),
    )
  }

  #chainNodes(def) {
    const nodes = []
    const inputs = Object.entries(def.input)
    inputs.forEach(([id, n], i) => {
      nodes.push(el('span', { text: `${n}${ITEMS[id].emoji}` }))
      if (i < inputs.length - 1) nodes.push(el('span', { class: 'chain__arrow', text: '+' }))
    })
    nodes.push(el('span', { class: 'chain__arrow', text: '→' }))
    nodes.push(el('span', { text: `${ITEMS[def.output].emoji} ${ITEMS[def.output].name}` }))
    return nodes
  }

  #chains() {
    return el(
      'div',
      {},
      ...factoryList.map((def) =>
        el(
          'div',
          { class: 'chain', style: { padding: '4px 0' } },
          el('span', { text: `${def.emoji} ${def.name}:` }),
          ...this.#chainNodes(def),
        ),
      ),
    )
  }

  // --------------------------------------------------------------- nursery --

  nursery() {
    const selected = []

    const render = () => {
      const adults = this.farm.creatures.filter((c) => c.isAdult)
      const body = []

      const eggs = this.farm.nursery.eggs
      body.push(
        el('div', {
          class: 'note',
          html: eggs.length
            ? `В инкубаторе: ${eggs
                .map((e) => `<b>${speciesDef(e.offspringId).name}</b> — ${Math.ceil(e.timer)} c`)
                .join(', ')}. Свободно мест: ${this.farm.nursery.free}.`
            : `Инкубатор пуст. Выберите <b>двух взрослых</b> существ: одинаковые виды дадут обычное яйцо, разные — <b>гибрид</b>.`,
        }),
      )

      const pair = selected.map((id) => adults.find((c) => c.id === id)).filter(Boolean)
      const verdict = pair.length === 2 ? this.farm.nursery.check(pair[0], pair[1]) : null
      if (verdict?.ok) {
        const child = verdict.offspring
        body.push(
          el(
            'div',
            { class: 'note', style: { borderLeftColor: '#4fbf8b', background: 'rgba(79,191,139,0.16)' } },
            el('b', { text: `${child.emoji} ${child.name}` }),
            el('div', {
              html: `Товары: ${child.products.map((p) => ITEMS[p].emoji + ' ' + ITEMS[p].name).join(', ')} · раз в ${Math.round(
                child.produceTime,
              )} c · вылупится за ${Math.round(child.hatchTime * this.farm.stats.hatchMul)} c`,
            }),
          ),
        )
      } else if (pair.length === 2) {
        body.push(el('div', { class: 'note', style: { borderLeftColor: '#e8543f' }, text: verdict.reason }))
      }

      body.push(
        el(
          'div',
          { class: 'cards' },
          ...adults.map((c) => {
            const chosen = selected.includes(c.id)
            const ready = c.breedCooldown <= 0
            return el(
              'div',
              {
                class: `card${chosen ? '' : ready ? '' : ' card--locked'}`,
                style: chosen ? { outline: '3px solid #8b5cf6', background: 'rgba(139,92,246,0.16)' } : {},
                onclick: () => {
                  const at = selected.indexOf(c.id)
                  if (at >= 0) selected.splice(at, 1)
                  else {
                    if (selected.length >= 2) selected.shift()
                    selected.push(c.id)
                  }
                  render()
                },
              },
              el(
                'div',
                { class: 'card__head' },
                el('span', { class: 'card__emoji', text: c.def.emoji }),
                el(
                  'div',
                  {},
                  el('div', { class: 'card__name', text: c.def.name }),
                  el('div', { class: 'card__sub', text: ready ? 'готова' : `отдых ${Math.ceil(c.breedCooldown)} c` }),
                ),
              ),
              el('div', {
                class: 'card__sub',
                text: c.def.products.map((p) => ITEMS[p].name).join(' + '),
              }),
            )
          }),
        ),
      )

      if (!adults.length) body.push(el('div', { class: 'note', text: 'Пока нет взрослых существ — подрастите малышей.' }))

      this.modal.open({
        title: 'Питомник',
        body,
        foot: [
          {
            label: 'Скрестить',
            cls: 'btn--plum',
            disabled: !verdict?.ok,
            onClick: () => {
              if (this.actions.breed(selected[0], selected[1]).ok) {
                selected.length = 0
                render()
              }
            },
          },
          { label: 'Закрыть', cls: 'btn--ghost', onClick: () => this.modal.close() },
        ],
      })
    }

    render()
  }

  // ---------------------------------------------------------------- roster --

  roster() {
    const render = () => {
      const list = [...this.farm.creatures].sort((a, b) => a.def.name.localeCompare(b.def.name))
      const body = [
        el('div', {
          class: 'note',
          html: `Всего на ферме: <b>${list.length}</b> ${plural(list.length, 'работник', 'работника', 'работников')}, из них взрослых — <b>${
            list.filter((c) => c.isAdult).length
          }</b>, гибридов — <b>${this.farm.countHybrids()}</b>.`,
        }),
        el(
          'div',
          { class: 'cards' },
          ...list.map((c) => {
            const price = Math.round((c.isAdult ? c.def.adultPrice : c.def.eggPrice) * 0.5)
            return el(
              'div',
              { class: 'card' },
              el(
                'div',
                { class: 'card__head' },
                el('span', { class: 'card__emoji', text: c.def.emoji }),
                el(
                  'div',
                  {},
                  el('div', { class: 'card__name', text: c.def.name + (isHybrid(c.speciesId) ? ' 🧬' : '') }),
                  el('div', { class: 'card__sub', text: c.isAdult ? 'взрослая' : `малыш ${c.meals}/${c.def.mealsToGrow}` }),
                ),
              ),
              el(
                'div',
                { class: 'card__body' },
                el('div', { class: 'card__row' }, el('span', { text: 'Товар' }), el('span', { text: c.def.products.map((p) => ITEMS[p].emoji).join(' ') })),
                el('div', { class: 'card__row' }, el('span', { text: 'Сытость' }), el('span', { text: c.satiety > 0 ? `${Math.ceil(c.satiety)} c` : 'голодна' })),
              ),
              el('button', {
                class: 'btn btn--ghost',
                text: `Продать за ${price} 🪙`,
                onclick: () => {
                  if (this.actions.sellCreature(c.id)) render()
                },
              }),
            )
          }),
        ),
      ]

      this.modal.open({
        title: 'Хозяйство',
        body,
        foot: [{ label: 'Закрыть', cls: 'btn--ghost', onClick: () => this.modal.close() }],
      })
    }
    render()
  }

  // ----------------------------------------------------------- level intro --

  levelIntro(level, index, stars, onStart) {
    const goalNodes = this.#goalPreview(level)
    this.modal.open({
      title: `Уровень ${index + 1} из ${LEVELS.length}: ${level.name}`,
      closable: false,
      body: [
        el('p', { text: level.story }),
        el('h3', { text: 'Цели' }),
        goalNodes,
        el('div', { class: 'note', html: `Время: <b>${formatTime(level.time)}</b> · три звезды — уложиться в <b>${formatTime(level.time * level.stars[0])}</b>` }),
        level.tips?.length
          ? el('div', { class: 'helplist' }, ...level.tips.map((tip) => el('div', { class: 'helprow' }, el('div', { text: '💡' }), el('div', { html: tip }))))
          : null,
        stars ? el('div', { class: 'note', html: `Ваш лучший результат: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` }) : null,
      ],
      foot: [{ label: 'Начать!', cls: 'btn--plum', onClick: () => {
        this.modal.close()
        onStart()
      } }],
    })
  }

  #goalPreview(level) {
    const rows = []
    const g = level.goals ?? {}
    if (g.coins != null) rows.push(['🪙', `Иметь ${formatNumber(g.coins)} монет`])
    if (g.earned != null) rows.push(['💰', `Заработать ${formatNumber(g.earned)} монет`])
    for (const [id, n] of Object.entries(g.produce ?? {})) rows.push([ITEMS[id].emoji, `Собрать ${n} × ${ITEMS[id].name}`])
    for (const [id, n] of Object.entries(g.creatures ?? {})) rows.push([speciesDef(id).emoji, `Иметь ${n} взрослых (${speciesDef(id).name})`])
    if (g.hybrids != null) rows.push(['🧬', `Вывести гибридов: ${g.hybrids}`])
    if (g.trap != null) rows.push(['🪤', `Поймать тёмных тварей: ${g.trap}`])
    return el('div', { class: 'helplist' }, ...rows.map(([icon, text]) => el('div', { class: 'helprow' }, el('div', { text: icon }), el('div', { text }))))
  }

  // ---------------------------------------------------------- level result --

  levelResult({ won, farm, level, isLast }, { onShop, onNext, onRetry }) {
    const stars = won ? starsFor(level, farm.usedFraction) : 0
    const produced = Object.entries(farm.produced)
    const body = [
      el('div', { class: 'stars', text: won ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆' }),
      el(
        'div',
        { class: 'result-grid' },
        el('span', { text: 'Заработано' }),
        el('span', { text: `${formatNumber(farm.earned)} 🪙` }),
        el('span', { text: 'Монет на руках' }),
        el('span', { text: `${formatNumber(farm.coins)} 🪙` }),
        el('span', { text: 'Затрачено времени' }),
        el('span', { text: formatTime(farm.elapsed) }),
        el('span', { text: 'Собрано товаров' }),
        el('span', { text: String(produced.reduce((s, [, n]) => s + n, 0)) }),
        el('span', { text: 'Поймано тварей' }),
        el('span', { text: String(farm.trapped) }),
        farm.stolen ? el('span', { text: 'Украдено тварями' }) : null,
        farm.stolen ? el('span', { text: String(farm.stolen) }) : null,
        farm.fainted ? el('span', { text: 'Потеряно от голода' }) : null,
        farm.fainted ? el('span', { text: String(farm.fainted) }) : null,
      ),
      produced.length
        ? el('div', { class: 'chain', style: { marginTop: '8px' } }, ...produced.map(([id, n]) => el('span', { text: `${n}×${ITEMS[id].emoji}` })))
        : null,
      won
        ? null
        : el('div', {
            class: 'note',
            style: { borderLeftColor: '#e8543f' },
            text: 'Цели не выполнены вовремя. Заработанное за уровень не засчитывается — попробуйте ещё раз.',
          }),
    ]

    this.modal.open({
      title: won ? (isLast ? 'Ярмарка покорена!' : 'Уровень пройден!') : 'Время вышло',
      closable: false,
      body,
      foot: won
        ? [
            { label: '🛠 В лавку улучшений', cls: 'btn--gold', onClick: () => onShop(stars) },
            { label: isLast ? 'Финал' : 'Следующий уровень', cls: 'btn--plum', onClick: () => onNext(stars) },
          ]
        : [{ label: 'Ещё раз', cls: 'btn--plum', onClick: () => onRetry() }],
    })
  }

  // ------------------------------------------------------------------ shop --

  shop(onDone) {
    const render = () => {
      const body = [
        el('div', { class: 'note', html: `Улучшения остаются с вами до конца кампании. Монет: <b>${formatNumber(this.progress.coins)}</b> 🪙` }),
        el(
          'div',
          { class: 'cards' },
          ...upgradeList.map((def) => {
            const owned = this.progress.upgrades[def.id] ?? 0
            const cost = upgradeCost(def.id, owned)
            const maxed = cost === null
            const affordable = !maxed && this.progress.coins >= cost
            return el(
              'div',
              { class: `card${maxed || affordable ? '' : ' card--locked'}` },
              el(
                'div',
                { class: 'card__head' },
                el('span', { class: 'card__emoji', text: def.emoji }),
                el(
                  'div',
                  {},
                  el('div', { class: 'card__name', text: def.name }),
                  el('div', { class: 'card__sub', text: `${owned}/${def.levels} ${'●'.repeat(owned)}${'○'.repeat(def.levels - owned)}` }),
                ),
              ),
              el('div', { class: 'card__body' }, el('div', { class: 'card__sub', text: def.desc })),
              el('button', {
                class: `btn ${maxed ? 'btn--ghost' : 'btn--gold'}`,
                text: maxed ? 'Максимум' : `Купить — ${formatNumber(cost)} 🪙`,
                disabled: maxed || !affordable,
                onclick: () => {
                  if (this.actions.buyUpgrade(def.id)) render()
                },
              }),
            )
          }),
        ),
      ]
      this.modal.open({
        title: 'Лавка улучшений',
        closable: false,
        body,
        foot: [{ label: 'Дальше →', cls: 'btn--plum', onClick: () => onDone() }],
      })
    }
    render()
  }

  // ----------------------------------------------------------------- pause --

  pause({ onResume, onRestart, onHelp, onQuit }) {
    this.modal.open({
      title: 'Пауза',
      closable: true,
      onClose: onResume,
      body: [
        el('div', { class: 'note', html: `Уровень: <b>${this.farm.level.name}</b> · осталось <b>${formatTime(this.farm.timeLeft)}</b>` }),
        this.#goalPreview(this.farm.level),
      ],
      foot: [
        { label: '▶ Продолжить', cls: 'btn--plum', onClick: () => this.modal.close() },
        { label: '❓ Справка', cls: 'btn--ghost', onClick: onHelp },
        { label: '⟲ Начать уровень заново', cls: 'btn--ghost', onClick: onRestart },
        { label: '✖ Сдаться', cls: 'btn--ghost', onClick: onQuit },
      ],
    })
  }

  // -------------------------------------------------------------- campaign --

  campaignEnd(progress, onRestart) {
    const total = Object.values(progress.stars).reduce((s, n) => s + n, 0)
    this.modal.open({
      title: 'Ферма Чудес пройдена!',
      closable: false,
      body: [
        el('div', { class: 'stars', text: '★'.repeat(3) }),
        el('p', {
          html: `Вы собрали <b>${total}</b> из <b>${LEVELS.length * 3}</b> звёзд и заработали <b>${formatNumber(
            progress.coins,
          )}</b> монет. Феи, русалки, ведьмы, слизни, дракончики и грифоны вам благодарны.`,
        }),
        el(
          'div',
          { class: 'helplist' },
          ...LEVELS.map((lvl, i) =>
            el(
              'div',
              { class: 'helprow' },
              el('div', { text: '★'.repeat(progress.stars[lvl.id] ?? 0) || '☆' }),
              el('div', { text: `${i + 1}. ${lvl.name}` }),
            ),
          ),
        ),
      ],
      foot: [{ label: 'Пройти заново', cls: 'btn--plum', onClick: onRestart }],
    })
  }

  /** Выбор уровня — доступны пройденные и следующий. */
  levelSelect(progress, onPick) {
    const maxIndex = Math.min(progress.levelIndex, LEVELS.length - 1)
    this.modal.open({
      title: 'Выбор уровня',
      body: el(
        'div',
        { class: 'cards' },
        ...LEVELS.map((lvl, i) => {
          const locked = i > maxIndex
          const stars = progress.stars[lvl.id] ?? 0
          return el(
            'div',
            { class: `card${locked ? ' card--locked' : ''}` },
            el('div', { class: 'card__head' }, el('span', { class: 'card__emoji', text: locked ? '🔒' : '🌻' }), el(
              'div',
              {},
              el('div', { class: 'card__name', text: `${i + 1}. ${lvl.name}` }),
              el('div', { class: 'card__sub', text: '★'.repeat(stars) + '☆'.repeat(3 - stars) }),
            )),
            el('button', { class: 'btn btn--plum', text: 'Играть', disabled: locked, onclick: () => onPick(i) }),
          )
        }),
      ),
      foot: [{ label: 'Закрыть', cls: 'btn--ghost', onClick: () => this.modal.close() }],
    })
  }
}
