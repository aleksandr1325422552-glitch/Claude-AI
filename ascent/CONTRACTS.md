# Контракты модулей «Ввысь»

Документ фиксирует границы между системами. Каждый модуль реализуется
независимо; всё взаимодействие идёт только через описанные здесь сигнатуры.

## Общие правила

- ES-модули, `import * as THREE from 'three'`.
- Комментарии и названия в интерфейсе — по-русски, как в остальном проекте.
  Комментировать «почему», а не «что»: код и так виден.
- Никаких внешних ассетов. Вся геометрия строится из примитивов Three.js,
  весь звук синтезируется через WebAudio.
- Ничего не создавать в игровом цикле: меши, векторы и материалы готовятся
  заранее и переиспользуются. Временные `THREE.Vector3` — на уровне модуля.
- Существующие помощники брать, а не переписывать:
  - `src/core/util.js` — `clamp`, `clamp01`, `lerp`, `damp`, `dampAngle`,
    `smoothstep`, `moveTowards`, `remap`, `easeOut*`, `formatHeight`, `TAU`.
  - `src/core/rng.js` — `createRng(seed)` → `{next, range, int, chance, pick,
    weighted, spread, shuffle, fork}`, `createNoise1d(seed)`.
  - `src/render/materials.js` — `toon(color, {ramp, rim, ...})`,
    `glow(color)`, `veil(color, opacity)`, `water(color)`.
  - `src/game/config.js` — все числа баланса. Магических констант в коде быть
    не должно; если числа не хватает — добавить его в config.
- Мир: ось башни — это вертикаль в точке `x=0, z=0`. Игрок поднимается вокруг
  неё. Высота в метрах равна `position.y`.

## Система координат и столкновения

Коллайдеры — это выровненные по осям параллелепипеды (AABB). Формы сложнее
не нужны: платформы башни прямоугольные, а мягкость силуэта даёт декор,
который в столкновениях не участвует.

### `src/world/collision.js`

```js
/**
 * @typedef {object} Collider
 * @property {number} minX @property {number} minY @property {number} minZ
 * @property {number} maxX @property {number} maxY @property {number} maxZ
 * @property {string} kind      'solid' | 'oneway' | 'hazard' | 'bounce' | 'crumble'
 * @property {object|null} owner Платформа-владелец: через неё берут скорость движения.
 */

/** Хранилище коллайдеров с разбиением по высоте. */
export function createCollisionWorld(bucketHeight = 8)
// → {
//   add(collider),                       // collider создаётся через makeCollider
//   removeByOwner(owner),                // снять все коллайдеры платформы
//   clear(),
//   query(minX, minY, minZ, maxX, maxY, maxZ, out = []) → Collider[],
//   raycastDown(x, z, fromY, maxDistance) → { y, collider } | null,
//   count
// }

/** Собирает коллайдер из центра и размеров. */
export function makeCollider(cx, cy, cz, sx, sy, sz, kind = 'solid', owner = null)

/** Двигает коллайдер (для платформ-лифтов): пересчитывает границы по центру. */
export function moveCollider(collider, cx, cy, cz)

/**
 * Двигает тело-параллелепипед с разрешением столкновений по осям.
 *
 * Оси разводятся по очереди (Y, затем X, затем Z) — это даёт устойчивое
 * скольжение вдоль стен и корректный контакт с землёй без застреваний в углах.
 *
 * @param {ReturnType<createCollisionWorld>} world
 * @param {THREE.Vector3} position  Центр низа тела (ноги). Меняется на месте.
 * @param {THREE.Vector3} velocity  Меняется на месте.
 * @param {object} body   { radius, height }
 * @param {number} dt
 * @param {object} [opts] { dropThrough: boolean } — пройти сквозь 'oneway' вниз
 * @returns {{
 *   grounded: boolean,
 *   ground: Collider|null,
 *   hitWall: boolean,
 *   hitCeiling: boolean,
 *   landedSpeed: number,      // скорость по Y в момент касания земли (<= 0)
 *   touched: Collider[]       // все коллайдеры, которых коснулись за шаг
 * }}
 */
export function moveBody(world, position, velocity, body, dt, opts = {})
```

Правила:
- `'oneway'` — платформа, сквозь которую проходят снизу вверх и с которой
  спрыгивают по «вниз+прыжок»; сверху она твёрдая.
- `'hazard'` — шипы: не блокируют движение, но попадают в `touched`.
- `'bounce'` — батут: подбрасывает, силу берёт вызывающая сторона.
- `'crumble'` — осыпающаяся платформа: ведёт себя как `'solid'`, разрушение
  считает генератор.
- Платформа-владелец может иметь `owner.velocity` (`THREE.Vector3`) — стоящее
  на ней тело переносится вместе с платформой.

## Мир

### `src/world/platforms.js`

Строит меши платформ. Ни одна функция не трогает сцену — только возвращает
объекты; расстановкой занимается генератор.

```js
/**
 * @typedef {object} PlatformBuild
 * @property {THREE.Object3D} mesh    Готовая к добавлению в сцену группа.
 * @property {Array<{cx,cy,cz,sx,sy,sz,kind}>} boxes  Коллайдеры в локальных координатах меша.
 * @property {number} radius          Габарит для расстановки декора и врагов.
 * @property {Array<{x,y,z}>} spawnPoints  Куда генератор может ставить врагов и пикапы.
 */

/**
 * @param {string} kind  'rock' | 'disc' | 'bridge' | 'pillar' | 'crumble' |
 *                       'bounce' | 'spike' | 'lift' | 'rotator'
 * @param {object} params { size, seed, palette }
 * @param {object} rng    Поток из createRng
 * @param {object} palette Состояние палитры (цвета — THREE.Color)
 * @returns {PlatformBuild}
 */
export function buildPlatform(kind, params, rng, palette)
```

Требования к виду: низкополигональный гранёный камень (икосаэдр/цилиндр с
малым числом сегментов и смещёнными вершинами), сверху — трава или снег
цветом `palette.foliage`, бока — `palette.rock` / `palette.rockDeep`.
Материалы только через `toon()`. Статичный декор склеивать в один меш.

### `src/world/props.js`

```js
/** Дерево, куст, кристалл, флаг, столб-маяк, камни. Все — из примитивов. */
export function buildTree(rng, palette)      // → THREE.Object3D
export function buildBush(rng, palette)
export function buildCrystalCluster(rng, palette)
export function buildBanner(rng, palette)
export function buildCheckpointBeacon(palette) // → { mesh, activate(), update(dt) }
export function buildRubble(rng, palette)

/** Трава пучками на InstancedMesh — раскидать по верхней грани платформы. */
export function buildGrassPatch(count, radius, rng, palette) // → THREE.InstancedMesh
```

### `src/world/generator.js`

```js
/**
 * Бесконечная башня, собираемая сегментами по мере подъёма.
 *
 * @param {THREE.Scene} scene
 * @param {ReturnType<createCollisionWorld>} collision
 * @param {object} opts { seed }
 * @returns {{
 *   root: THREE.Group,
 *   update(playerY, dt): void,     // достраивает верх, убирает низ, двигает лифты
 *   platforms: Array,              // активные платформы
 *   spawnQueue: Array,             // точки под врагов/пикапы, генератор наполняет
 *   checkpoints: Array<{y, x, z, reached}>,
 *   nearestCheckpoint(y): {x,y,z} | null,
 *   startPoint: {x,y,z},           // где ставить игрока в начале
 *   reset(seed): void,
 *   dispose(): void
 * }}
 */
export function createTower(scene, collision, opts = {})
```

Требования:
- Сегмент высотой `TOWER.chunkHeight`; держать `chunksAhead` выше игрока и
  `chunksBehind` ниже, остальное — снимать со сцены и освобождать коллайдеры.
- Каждый сегмент строится своим потоком `rng.fork(индекс)`: содержимое сегмента
  не должно зависеть от порядка генерации соседей.
- Гарантия проходимости: между соседними платформами по высоте — не больше
  `TOWER.stepMax` по вертикали и такое расстояние по горизонтали, которое
  берётся прыжком с параметрами из `PHYSICS`. Проверить расчётом, а не на глаз.
- Сложность растёт с высотой: доля движущихся, осыпающихся и шипастых платформ
  увеличивается, площадки становятся мельче.
- Чекпойнт каждые `TOWER.checkpointEvery` метров — широкая платформа с маяком.

## Игровые системы

### `src/game/player.js`

```js
/**
 * @param {THREE.Scene} scene
 * @param {object} deps { fx, audio, camera }  // camera — риг из render/camera.js
 * @returns {{
 *   object3d: THREE.Group,
 *   position: THREE.Vector3,   // ноги
 *   velocity: THREE.Vector3,
 *   state: {
 *     grounded, health, stamina, facing, dashing, dead,
 *     invulnerableUntil, maxHeight, lastGroundY
 *   },
 *   update(input, world, dt): void,
 *   damage(amount, fromPosition): boolean,   // true, если урон прошёл
 *   respawn(point): void,
 *   dispose(): void
 * }}
 */
export function createPlayer(scene, deps)
```

`input` — объект из `src/core/input.js` (см. ниже). `world` — фасад:
`{ collision, tower, hazardY, fx, audio, events, palette }`.

Требования:
- Физика строго по `PHYSICS`: время койота, буфер прыжка, двойной прыжок за
  стамину, рывок с неуязвимостью к шипам на время рывка.
- Персонаж — процедурная низкополигональная фигурка (капсула-тело, голова,
  руки-ноги из вытянутых боксов). Анимация — покачивание конечностей от
  скорости, приседание при приземлении, растяжение в прыжке. Никаких скелетов.
- Ход по кругу вокруг башни: направление ввода поворачивается на угол камеры
  (`deps.camera.yaw`), чтобы «вперёд» всегда значило «от камеры».

### `src/game/enemies.js`

```js
/**
 * @returns {{
 *   root: THREE.Group,
 *   spawn(kind, position, opts): object,   // 'chaser' | 'patrol' | 'spitter'
 *   update(player, world, dt): void,
 *   despawnBelow(y): void,
 *   clear(): void,
 *   list: Array,
 *   dispose(): void
 * }}
 */
export function createEnemies(scene)
```

Требования: параметры строго из `ENEMY`. Урон наносится вызовом
`player.damage(1, enemyPosition)`. Преследователь ускоряется по высоте, но
теряет игрока за `aggroRange`. Снаряды плевуна — свой пул.

### `src/game/hazard.js`

```js
/**
 * Поднимающаяся снизу пустота: главный источник напряжения.
 *
 * @returns {{
 *   root: THREE.Object3D,
 *   y: number,
 *   reset(startY): void,
 *   update(playerY, dt): void,
 *   danger: number,          // 0..1 — насколько близко, для интерфейса и звука
 *   dispose(): void
 * }}
 */
export function createHazard(scene)
```

Вид: непрозрачная волнующаяся поверхность цветом, контрастным палитре, с
клубящейся дымкой и тянущимися вверх щупальцами. Поверхность — плоскость с
волной в вершинном шейдере, всегда центрируется под игроком.

### `src/game/pickups.js`

```js
/**
 * @returns {{
 *   root: THREE.Group,
 *   spawn(kind, position): void,   // 'crystal' | 'stamina' | 'heart'
 *   update(player, world, dt): void,
 *   despawnBelow(y): void,
 *   clear(): void,
 *   dispose(): void
 * }}
 */
export function createPickups(scene)
```

## Ввод, звук, сохранение

### `src/core/input.js`

```js
/**
 * Клавиатура, тач и геймпад сводятся к одному набору намерений.
 *
 * @returns {{
 *   move: {x: number, y: number},  // -1..1, y — «вперёд»
 *   jumpPressed: boolean,          // фронт нажатия, гаснет после consumeJump()
 *   jumpHeld: boolean,
 *   dashPressed: boolean,
 *   downHeld: boolean,
 *   pausePressed: boolean,
 *   anyPressed: boolean,
 *   consumeJump(): boolean,
 *   consumeDash(): boolean,
 *   consumePause(): boolean,
 *   update(): void,                // вызывать раз в кадр после игровой логики
 *   attachTouch(container): void,  // виртуальный стик + кнопки для телефона
 *   dispose(): void
 * }}
 */
export function createInput(target = window)
```

Управление: WASD/стрелки — движение, Пробел — прыжок, Shift — рывок,
S/вниз + прыжок — спрыгнуть с проходимой платформы, Esc — пауза.

### `src/core/audio.js`

```js
/**
 * Процедурный звук на WebAudio: ни одного файла.
 *
 * @returns {{
 *   resume(): Promise<void>,        // вызывать по первому касанию
 *   play(name, opts): void,
 *   setMusic(enabled): void,
 *   setMuted(muted): void,
 *   /** Тревога от близости пустоты: 0..1 ведёт фильтр и громкость гула. *\/
 *   setDanger(value): void,
 *   setBiome(index): void,          // меняет лад фоновой темы
 *   dispose(): void
 * }}
 */
export function createAudio()
```

Имена звуков: `jump`, `doubleJump`, `land`, `dash`, `hurt`, `die`, `crystal`,
`stamina`, `checkpoint`, `enemyHit`, `crumble`, `bounce`, `menu`, `start`.

### `src/core/save.js`

```js
/** Рекорд и настройки в localStorage, устойчиво к битым данным. */
export function createSave()
// → { best, runs, settings: {muted, quality, music}, submit(score, height), setSetting(k, v), reset() }
```

## Интерфейс

### `src/ui/hud.js`

```js
/**
 * @param {HTMLElement} container
 * @returns {{
 *   update(state): void,   // { height, maxHeight, score, multiplier, health,
 *                          //   stamina, danger, biomeName, fps }
 *   showToast(text, kind): void,
 *   dispose(): void
 * }}
 */
export function createHud(container)
```

### `src/ui/screens.js`

```js
/**
 * Меню, пауза, экран смерти. Возвращает промисы решений игрока.
 *
 * @returns {{
 *   showMenu(save): Promise<{action: 'start'|'settings'}>,
 *   showPause(): Promise<'resume'|'restart'|'menu'>,
 *   showDeath(result): Promise<'restart'|'menu'>,
 *   hide(): void,
 *   dispose(): void
 * }}
 */
export function createScreens(container, deps)
```

Стиль интерфейса — в `src/ui/styles.css`: крупная скруглённая типографика,
полупрозрачные панели со скруглением 18–24 px, цвета согласованы с палитрой
(тёплый низ — холодный верх). Никаких внешних шрифтов, только системные.
