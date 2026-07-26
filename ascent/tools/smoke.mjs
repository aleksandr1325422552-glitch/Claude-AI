/**
 * Дымовой прогон игры в настоящем браузере.
 *
 * Юнит-тесты проверяют физику и генератор, но не могут поймать то, что ломается
 * только при живом рендере: несуществующий импорт, ошибку компиляции шейдера,
 * обращение к неинициализированному объекту в первом кадре. Здесь игра
 * действительно запускается, играет сама с собой и падает при первой же ошибке
 * в консоли.
 *
 *   node tools/smoke.mjs [--keep-shots]
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/**
 * Можно прогнать не обычную сборку, а вариант для хостинга страниц-артефактов:
 *
 *   node tools/smoke.mjs --artifact
 *
 * Он отдаётся без собственных doctype и meta — их добавляет хостинг. Проверять
 * его отдельно обязательно: без объявления кодировки кириллица в интерфейсе
 * может развалиться, и заметить это можно только в живом браузере.
 */
const asArtifact = process.argv.includes('--artifact')

/** Каркас документа, в который хостинг оборачивает содержимое страницы. */
const wrapArtifact = (inner) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
  `</head><body>${inner}</body></html>`

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]

  // Значок вкладки браузер запрашивает сам, и его отсутствие даёт 404, который
  // не имеет отношения к игре. Отдаём пустой ответ, чтобы он не засорял отчёт.
  if (path === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (asArtifact && path === '/index.html') {
      const inner = await readFile(join(dist, 'ввысь-артефакт.html'), 'utf8')
      // Заголовок Content-Type намеренно без charset: так проверяется, что
      // страница переживает хостинг, который кодировку не объявляет.
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(wrapArtifact(inner))
      return
    }
    const body = await readFile(join(dist, path))
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('нет такого файла')
  }
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // Без этих ключей в контейнере нет GPU и WebGL не поднимется вовсе.
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const errors = []
page.on('pageerror', (error) => errors.push(`ошибка страницы: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`консоль: ${message.text()}`)
})
// Ненайденный ресурс сам по себе не роняет игру, но означает, что в сборку
// просочилась ссылка наружу — а игра обязана быть самодостаточной.
page.on('requestfailed', (request) => errors.push(`запрос не прошёл: ${request.url()}`))
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} на ${response.url()}`)
})

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })

// Ждём, пока сцена действительно появится: канвас создаётся при старте.
await page.waitForSelector('canvas', { timeout: 15000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: join(root, 'shot-menu.png') })

// Запускаем забег и играем: бежим, прыгаем и рвёмся вперёд, чтобы задеть
// физику, генерацию, врагов и эффекты, а не только первый кадр.
await page.keyboard.press('Space')
await page.waitForTimeout(600)

// Бот играет вслепую и вполне может сорваться — это нормально. Нам важно,
// что игра при этом живёт: высота росла, кадры шли, ошибок не было.
let peakHeight = 0
let sawPositiveHeight = false

const sampleHeight = async () => {
  const text = await page.evaluate(() => document.querySelector('.hud-height-value')?.textContent ?? '')
  const value = Number.parseFloat(text.replace(',', '.')) || 0
  const metres = text.includes('км') ? value * 1000 : value
  if (metres > 0) sawPositiveHeight = true
  if (metres > peakHeight) peakHeight = metres
}

// Направление меняем по ходу: башня закручена спиралью, и бег строго вперёд
// уводит с неё через несколько метров.
const keys = ['KeyW', 'KeyD', 'KeyW', 'KeyA']
for (let i = 0; i < 30; i++) {
  const key = keys[i % keys.length]
  await page.keyboard.down(key)
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  if (i % 6 === 5) await page.keyboard.press('ShiftLeft')
  await page.keyboard.up(key)
  await sampleHeight()

  // Кадр снимаем по ходу забега, а не в конце: бот играет вслепую и обычно
  // успевает сорваться, а в конце тогда виден только экран смерти.
  if (i === 3) await page.screenshot({ path: join(root, 'shot-game.png') })
  if (i === 12) await page.screenshot({ path: join(root, 'shot-climb.png') })
}

await page.waitForTimeout(600)

const stats = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const app = document.querySelector('#app')
  return {
    biome: document.querySelector('.hud-biome')?.textContent ?? '',
    score: document.querySelector('.hud-score-value')?.textContent ?? '',
    canvasSize: canvas ? `${canvas.width}×${canvas.height}` : 'нет канваса',
    appSize: app ? `${app.clientWidth}×${app.clientHeight}` : 'нет контейнера',
    // Высота содержимого документа. Хостинг страниц выводит из неё высоту
    // кадра, поэтому ноль здесь означает схлопнутый кадр и чёрный экран —
    // поломку, которую не видно ни по одной ошибке в консоли.
    contentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  }
})
stats.peakHeight = `${peakHeight.toFixed(1)} м`
stats.sawPositiveHeight = sawPositiveHeight

/**
 * Проверка на схлопывание во встроенном кадре.
 *
 * Кадр без заданной высоты стартует со 150 пикселей и растёт до высоты
 * содержимого. Если игра выводит свою высоту из высоты окна, она соглашается
 * на эти 150 и остаётся полоской навсегда — замкнутый круг, из которого нечему
 * её вытолкнуть. Сжимаем окно до этой высоты и смотрим, устоит ли вёрстка.
 *
 * Без этой проверки предыдущая версия проходила дымовой прогон: в окне
 * 1280×720 высота приходила снаружи, и разницы между рабочей и схлопнутой
 * вёрсткой не было видно.
 */
await page.setViewportSize({ width: 1280, height: 150 })
await page.waitForTimeout(500)
const squeezed = await page.evaluate(() => {
  const app = document.querySelector('#app')
  return {
    content: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    app: app ? app.clientHeight : 0,
  }
})
stats.squeezed = `содержимое ${squeezed.content}px, поле ${squeezed.app}px`

await browser.close()
server.close()

console.log('Показатели после прогона:')
for (const [key, value] of Object.entries(stats)) console.log(`  ${key}: ${value}`)

if (errors.length) {
  console.error(`\nОшибок в браузере: ${errors.length}`)
  for (const error of [...new Set(errors)].slice(0, 20)) console.error(`  • ${error}`)
  process.exit(1)
}

if (!sawPositiveHeight) {
  console.error('\nВысота ни разу не выросла — забег, похоже, не начался.')
  process.exit(1)
}

// Порог с запасом ниже окна прогона: важно поймать схлопывание в ноль, а не
// придираться к десяткам пикселей.
if (stats.contentHeight < 400) {
  console.error(`\nВысота содержимого документа ${stats.contentHeight}px — во встроенном кадре`)
  console.error('игра схлопнется в полоску и покажет чёрный экран.')
  process.exit(1)
}

if (!/^[1-9]/.test(stats.appSize)) {
  console.error(`\nКонтейнер игры нулевого размера (${stats.appSize}).`)
  process.exit(1)
}

if (squeezed.content < 400 || squeezed.app < 400) {
  console.error(`\nВ узком окне вёрстка схлопнулась: ${stats.squeezed}.`)
  console.error('Во встроенном кадре, который стартует со 150 пикселей, игра останется полоской.')
  process.exit(1)
}

console.log('\nОшибок нет, игра запускается и играется.')
