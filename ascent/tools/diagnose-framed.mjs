/**
 * Воспроизведение настоящих условий хостинга страниц.
 *
 * Обвязка хостинга целиком спрятана под `if (window !== top)`, поэтому при
 * обычном открытии файла она не выполняется вовсе — и проверка вхолостую
 * говорит «всё хорошо». Здесь страница открывается во встроенном кадре, а
 * родитель отвечает по тому же протоколу, что и настоящий: подтверждает
 * подключение и меняет высоту кадра по сообщениям от содержимого.
 *
 *   node tools/diagnose-framed.mjs [путь-к-html]
 *
 * Без аргумента берёт свежую сборку dist/ввысь-артефакт.html и оборачивает её
 * в тот же каркас, что и хостинг.
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Отданная хостингом страница — из неё берём его обвязку. */
const SERVED = '/root/.claude/projects/-home-user-Claude-AI/23309281-5fd3-532c-b95b-a6ff87355880/tool-results/artifact-c373530f-1785083604-4968.html'

const served = await readFile(SERVED, 'utf8')

// Голова хостинга вместе с его рантаймом — всё до открывающего <body>.
const headEnd = served.indexOf('<body>') + '<body>'.length
const hostHead = served.slice(0, headEnd)

const inner = process.argv[2]
  ? await readFile(resolve(process.argv[2]), 'utf8')
  : await readFile(join(root, 'dist', 'ввысь-артефакт.html'), 'utf8')

let framePage = `${hostHead}\n${inner}\n</body></html>`

const server = createServer((req, res) => {
  const path = req.url.split('?')[0]

  if (path === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }

  if (path === '/frame') {
    // Рантайм хостинга принимает сообщения только от разрешённых источников,
    // а наш родитель живёт на localhost. Дописываем его в список — иначе
    // подтверждение подключения не дойдёт, и весь протокол не запустится.
    const patched = framePage.replace(
      'window.__FRAME_PREAMBLE={',
      `window.__FRAME_PREAMBLE={"origins":["http://127.0.0.1:${port}"],`,
    )
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(patched)
    return
  }

  // Родитель: ведёт себя как настоящий — подтверждает подключение и меняет
  // высоту кадра по сообщениям содержимого.
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#222}
    /* Высоту намеренно НЕ задаём: её должен установить сам кадр, как у хостинга. */
    iframe{display:block;width:100%;border:0}
  </style></head><body>
  <iframe id="f" src="/frame"></iframe>
  <script>
    const frame = document.getElementById('f')
    window.__sizes = []
    window.__ready = false
    addEventListener('message', (e) => {
      const d = e.data
      if (!d || typeof d !== 'object') return
      if (d.__frame_connect) {
        e.source.postMessage({ __frame_init: {
          theme: 'dark', contract: '1.0.0', changes: [], flags: [],
          capabilities: {}, capBudgets: {},
        } }, '*')
      }
      if (d.__frame_ready) window.__ready = true
      if (d.__frame_size) {
        window.__sizes.push(d.h)
        frame.style.height = d.h + 'px'
      }
    })
  <\/script></body></html>`)
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const log = []
page.on('pageerror', (e) => log.push(`ОШИБКА СТРАНИЦЫ: ${e.message}`))
page.on('console', (m) => {
  const text = m.text()
  // Предупреждения драйвера про производительность к делу не относятся.
  if (text.includes('GL Driver Message')) return
  log.push(`[${m.type()}] ${text}`)
})

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(5000)

const parentState = await page.evaluate(() => ({
  подтверждение: window.__ready,
  сообщенийОРазмере: window.__sizes.length,
  последниеРазмеры: window.__sizes.slice(-6).join(' → '),
  высотаКадра: document.getElementById('f').clientHeight,
}))

const frame = page.frames().find((f) => f.url().includes('/frame'))
const frameState = frame
  ? await frame.evaluate(() => {
      const app = document.querySelector('#app')
      const canvas = document.querySelector('canvas')
      return {
        встроен: window !== top,
        приложение: app ? `${app.clientWidth}×${app.clientHeight}` : 'НЕТ #app',
        канвас: canvas ? `${canvas.width}×${canvas.height}` : 'КАНВАСА НЕТ',
        окноКадра: `${innerWidth}×${innerHeight}`,
        высотаСодержимого: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        менюНаЭкране: !!document.querySelector('.panel'),
      }
    })
  : { ошибка: 'кадр не найден' }

await page.screenshot({ path: join(root, 'shot-framed.png'), fullPage: false })
await browser.close()
server.close()

console.log('Родитель:')
for (const [k, v] of Object.entries(parentState)) console.log(`  ${k}: ${v}`)
console.log('\nСодержимое кадра:')
for (const [k, v] of Object.entries(frameState)) console.log(`  ${k}: ${v}`)
console.log(`\nСообщений консоли: ${log.length}`)
for (const line of log.slice(0, 25)) console.log(`  ${line}`)
