/**
 * Рекорд и настройки в localStorage.
 *
 * Всё чтение обёрнуто в try/catch и падает на значения по умолчанию. Хранилище
 * бывает недоступно (приватный режим, отключённые куки), а лежащие в нём данные
 * могут оказаться битыми или чужими — и ни то, ни другое не повод ронять игру
 * на старте.
 */

const KEY = 'ввысь:сохранение'

const DEFAULTS = {
  best: 0,
  bestHeight: 0,
  runs: 0,
  settings: {
    muted: false,
    music: true,
    quality: null,
  },
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULTS)

    // Сливаем с умолчаниями поимённо, а не через spread: в сохранении из
    // старой версии может не быть новых полей, и они должны появиться.
    return {
      best: Number.isFinite(parsed.best) ? parsed.best : 0,
      bestHeight: Number.isFinite(parsed.bestHeight) ? parsed.bestHeight : 0,
      runs: Number.isFinite(parsed.runs) ? parsed.runs : 0,
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function createSave() {
  const data = read()

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      // Запись может не пройти (переполнение, приватный режим). Игре это не
      // мешает — просто рекорд не переживёт перезагрузку.
    }
  }

  return {
    get best() {
      return data.best
    },
    get bestHeight() {
      return data.bestHeight
    },
    get runs() {
      return data.runs
    },
    settings: data.settings,

    /**
     * Записывает итог забега.
     * @returns {boolean} true, если это новый рекорд по очкам.
     */
    submit(score, height) {
      data.runs++
      const record = score > data.best
      if (record) data.best = Math.floor(score)
      if (height > data.bestHeight) data.bestHeight = Math.floor(height)
      persist()
      return record
    },

    setSetting(key, value) {
      data.settings[key] = value
      persist()
    },

    reset() {
      data.best = 0
      data.bestHeight = 0
      data.runs = 0
      persist()
    },
  }
}
