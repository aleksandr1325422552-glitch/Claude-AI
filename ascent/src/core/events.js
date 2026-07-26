/**
 * Минимальная шина событий.
 *
 * Системам нужно сообщать друг другу о происходящем, не зная друг о друге:
 * подбор кристалла должен дойти до счёта, интерфейса и звука, но пикапам
 * незачем держать ссылки на все три. Полноценная библиотека здесь избыточна —
 * хватает подписки, отписки и рассылки.
 */

export function createEvents() {
  const handlers = new Map()

  return {
    /** Подписаться. Возвращает функцию отписки — так её труднее забыть. */
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set())
      handlers.get(name).add(fn)
      return () => handlers.get(name)?.delete(fn)
    },

    off(name, fn) {
      handlers.get(name)?.delete(fn)
    },

    /**
     * Разослать событие.
     *
     * Копируем набор перед обходом: обработчик вполне может отписаться прямо
     * во время рассылки, и без копии обход сломался бы на середине.
     */
    emit(name, payload) {
      const set = handlers.get(name)
      if (!set) return
      for (const fn of [...set]) fn(payload)
    },

    clear() {
      handlers.clear()
    },
  }
}
