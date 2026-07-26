/**
 * Диагностика реально отданной страницы.
 *
 * Берёт HTML ровно в том виде, в каком его отдаёт хостинг (со всей его обвязкой),
 * открывает в браузере и подробно рассказывает, что произошло: какие ошибки,
 * появился ли канвас, поднялся ли WebGL, какого размера получилось поле.
 *
 *   node tools/diagnose-served.mjs <путь-к-html>
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.argv[2])
const html = await readFile(file, 'utf8')

const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
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
page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`))
page.on('requestfailed', (r) => log.push(`ЗАПРОС НЕ ПРОШЁЛ: ${r.url()} — ${r.failure()?.errorText}`))

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(4000)

const state = await page.evaluate(() => {
  const app = document.querySelector('#app')
  const canvas = document.querySelector('canvas')

  // Проверяем WebGL отдельно от игры: если контекст не поднимается здесь,
  // причина не в коде игры вовсе.
  let webgl = 'не проверялся'
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') || probe.getContext('webgl')
    webgl = gl ? `есть (${gl.getParameter(gl.VERSION)})` : 'контекст не создался'
  } catch (e) {
    webgl = `исключение: ${e.message}`
  }

  return {
    приложение: app ? `${app.clientWidth}×${app.clientHeight}` : 'НЕТ #app',
    канвас: canvas ? `${canvas.width}×${canvas.height}` : 'КАНВАСА НЕТ',
    канвасВидим: canvas ? getComputedStyle(canvas).display : '—',
    высотаСодержимого: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    экранМеню: !!document.querySelector('.panel'),
    заголовокВидно: document.querySelector('.title')?.textContent ?? 'нет заголовка',
    webgl,
    детейВПриложении: app ? app.children.length : 0,
  }
})

await page.screenshot({ path: '/home/user/Claude-AI/ascent/shot-served.png' })
await browser.close()
server.close()

console.log('Состояние страницы:')
for (const [k, v] of Object.entries(state)) console.log(`  ${k}: ${v}`)

console.log(`\nСообщений консоли: ${log.length}`)
for (const line of log.slice(0, 40)) console.log(`  ${line}`)
