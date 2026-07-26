/**
 * Собирает игру в один самодостаточный HTML-файл.
 *
 * Стили и скрипт встраиваются прямо в разметку, внешних запросов не остаётся —
 * такой файл открывается двойным щелчком, кладётся на любой статический хостинг
 * и работает там, где сторонние файлы запрещены политикой безопасности.
 *
 *   npm run bundle            # или: npm run build && node tools/build-single-file.mjs
 *
 * По умолчанию пишет в dist/ввысь.html.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/** Внутри <script> и <style> закрывающий тег обязан быть экранирован. */
const escapeForScript = (code) => code.replace(/<\/(script)/gi, '<\\/$1')
const escapeForStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1')

const html = await readFile(join(dist, 'index.html'), 'utf8')

const scriptSrc = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1]
const styleHref = html.match(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)?.[1]
if (!scriptSrc) {
  throw new Error('В dist/index.html не найден собранный скрипт — сначала выполните `npm run build`.')
}

const readAsset = (href) => readFile(join(dist, href.replace(/^\.?\//, '')), 'utf8')

const script = await readAsset(scriptSrc)
// Стили Vite может встроить сам, если их немного, — тогда ссылки не будет.
const style = styleHref ? await readAsset(styleHref) : ''

// Берём разметку из собранного index.html, выбрасывая ссылки на внешние файлы.
const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/<script[^>]*><\/script>/g, '')
  .replace(/<link[^>]+rel="(stylesheet|modulepreload)"[^>]*>/g, '')
  .trim()

// Кодировку объявляем первой строкой: если хостинг отдаст файл без charset в
// заголовке, браузер всё равно прочитает кириллицу правильно.
const out = `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
<meta name="theme-color" content="#12101f" />
<title>Ввысь — бесконечный подъём</title>
${style ? `<style>\n${escapeForStyle(style)}\n</style>` : ''}

${body}

<script type="module">
${escapeForScript(script)}
</script>
`

const target = process.argv[2] ? resolve(process.argv[2]) : join(dist, 'ввысь.html')
await writeFile(target, out, 'utf8')

const kb = (n) => `${(n / 1024).toFixed(1)} КБ`
console.log(`Готово: ${target}`)
console.log(`  разметка ${kb(body.length)} · стили ${kb(style.length)} · скрипт ${kb(script.length)} · всего ${kb(out.length)}`)
