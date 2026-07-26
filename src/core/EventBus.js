/**
 * Минимальная шина событий. Симуляция ничего не знает о рендере и UI —
 * она лишь сообщает, что произошло, а слушатели решают, как это показать.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map()
  }

  /** Подписаться. Возвращает функцию отписки. */
  on(type, handler) {
    let set = this.listeners.get(type)
    if (!set) this.listeners.set(type, (set = new Set()))
    set.add(handler)
    return () => set.delete(handler)
  }

  off(type, handler) {
    this.listeners.get(type)?.delete(handler)
  }

  emit(type, payload) {
    const set = this.listeners.get(type)
    if (!set) return
    // Копия — слушатель может отписаться прямо во время обработки.
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[EventBus] ошибка в обработчике «${type}»`, err)
      }
    }
  }

  clear() {
    this.listeners.clear()
  }
}
