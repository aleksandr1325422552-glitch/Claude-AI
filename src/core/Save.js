/**
 * Прогресс между уровнями в localStorage: пройденные уровни, звёзды,
 * накопленные монеты и купленные улучшения.
 */

const KEY = 'monster-farm/progress/v1'

export function defaultProgress() {
  return {
    version: 1,
    levelIndex: 0, // индекс текущего (ещё не пройденного) уровня
    coins: 0, // монеты переносятся между уровнями
    stars: {}, // { [levelId]: 0..3 }
    upgrades: {}, // { [upgradeId]: количество купленных ступеней }
    soundOn: true,
    seenHelp: false,
  }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultProgress()
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 1) return defaultProgress()
    return { ...defaultProgress(), ...parsed }
  } catch {
    return defaultProgress()
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    /* приватный режим браузера — играем без сохранения */
  }
}

export function resetProgress() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* игнорируем */
  }
  return defaultProgress()
}
