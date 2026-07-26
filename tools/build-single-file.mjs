/**
 * Собирает игру в один самодостаточный HTML-файл: стили и скрипт встраиваются
 * прямо в разметку, внешних запросов не остаётся вовсе.
 *
 * Нужно для хостинга там, где сторонние файлы запрещены политикой безопасности
 * (например, страница-артефакт на claude.ai), и просто удобно: получившийся
 * файл можно открыть двойным щелчком или положить на любой статический хостинг.
 *
 *   npm run build && node tools/build-single-file.mjs [выходной-файл]
 *
 * По умолчанию пишет в dist/ферма-чудес.html.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/** Внутри <script> и <style> закрывающий тег нужно экранировать. */
const escapeForScript = (code) => code.replace(/<\/(script)/gi, '<\\/$1')
const escapeForStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1')

const html = await readFile(join(dist, 'index.html'), 'utf8')

const scriptSrc = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1]
const styleHref = html.match(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)?.[1]
if (!scriptSrc || !styleHref) {
  throw new Error('В dist/index.html не найдены собранные скрипт и стили — сначала выполните `npm run build`.')
}

const [script, style] = await Promise.all([
  readFile(join(dist, scriptSrc.replace(/^\.\//, '')), 'utf8'),
  readFile(join(dist, styleHref.replace(/^\.\//, '')), 'utf8'),
])

// Берём разметку из собранного index.html, выбрасывая ссылки на внешние файлы.
const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/<script[^>]*><\/script>/g, '')
  .trim()

// Кодировку объявляем первой строкой: если хостинг отдаст файл без charset в
// заголовке, браузер всё равно прочитает кириллицу правильно.
const out = `<meta charset="utf-8" />
<title>Ферма Чудес — девушки и монстры</title>
<style>
${escapeForStyle(style)}
</style>

${body}

<script type="module">
${escapeForScript(script)}
</script>
`

const target = process.argv[2] ? resolve(process.argv[2]) : join(dist, 'ферма-чудес.html')
await writeFile(target, out, 'utf8')

const kb = (n) => `${(n / 1024).toFixed(1)} КБ`
console.log(`Готово: ${target}`)
console.log(`  разметка ${kb(body.length)} · стили ${kb(style.length)} · скрипт ${kb(script.length)} · всего ${kb(out.length)}`)
