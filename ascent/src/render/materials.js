import * as THREE from 'three'

/**
 * Материалы игры.
 *
 * Весь мир нарисован тремя приёмами: ступенчатый свет вместо плавного, светлый
 * контур на границе силуэта и туман в цвет неба. Первое даёт мультяшность,
 * второе отделяет фигуры от фона (без него платформы сливаются в кашу на общем
 * плане), третье прячет границу подгрузки мира.
 *
 * Всё держится на MeshToonMaterial с подменой кусочков шейдера, а не на
 * самописном материале: так остаются бесплатными тени, туман и скиннинг.
 */

/**
 * Градиент освещения: сколько ступеней у света и насколько тёмная тень.
 * Три ступени — компромисс: две выглядят плоско, пять уже почти градиент.
 */
function createRampTexture(steps = 3, shadowFloor = 0.35) {
  const data = new Uint8Array(steps * 4)
  for (let i = 0; i < steps; i++) {
    // Крайняя ступень — полный свет, нижняя не уходит в чёрный: тени в игре
    // цветные, их подсвечивает ambient, и «угольные» пятна смотрелись бы грязно.
    const t = steps === 1 ? 1 : i / (steps - 1)
    const v = Math.round(255 * (shadowFloor + (1 - shadowFloor) * t))
    data[i * 4 + 0] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

let rampSoft = null
let rampHard = null

function ramps() {
  if (!rampSoft) {
    rampSoft = createRampTexture(4, 0.45)
    rampHard = createRampTexture(2, 0.3)
  }
  return { rampSoft, rampHard }
}

/**
 * Общие для всех материалов uniform-ы.
 *
 * Держим их одним объектом и раздаём по ссылке: подсветка контура и цвет
 * тумана меняются каждый кадр вместе с высотой, и обновлять сотню материалов
 * поимённо было бы и медленно, и легко забыть.
 */
export const sharedUniforms = {
  uRimColor: { value: new THREE.Color(0xffffff) },
  uRimPower: { value: 2.6 },
  uRimStrength: { value: 0.35 },
  uTime: { value: 0 },
}

/**
 * Врезает подсветку контура в готовый тун-материал.
 *
 * Считаем угол между нормалью и направлением на камеру: чем ближе поверхность к
 * «краю» силуэта, тем сильнее добавка. Это тот самый ободок, который в
 * мультяшной графике отделяет предмет от фона без обводки геометрией.
 */
function addRimLight(material, strengthScale = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = sharedUniforms.uRimColor
    shader.uniforms.uRimPower = sharedUniforms.uRimPower
    shader.uniforms.uRimStrength = sharedUniforms.uRimStrength
    shader.uniforms.uRimScale = { value: strengthScale }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform float uRimPower;
         uniform float uRimStrength;
         uniform float uRimScale;`,
      )
      // Вставляем добавку до тумана: иначе ободок светится сквозь дымку и
      // дальние платформы выглядят ближе, чем они есть.
      .replace(
        '#include <fog_fragment>',
        `float rimFacing = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
         float rim = pow(rimFacing, uRimPower) * uRimStrength * uRimScale;
         gl_FragColor.rgb += uRimColor * rim;
         #include <fog_fragment>`,
      )
    material.userData.shader = shader
  }
  // Без этого three переиспользует программу от материала без ободка.
  material.customProgramCacheKey = () => `rim${strengthScale}`
  return material
}

const cache = new Map()

/**
 * Матовый тун-материал. Одинаковые запросы возвращают один объект —
 * это режет число программ и позволяет склеивать геометрию по материалу.
 *
 * @param {number} color                Базовый цвет.
 * @param {object} [opts]
 * @param {'soft'|'hard'} [opts.ramp]   Мягкая ступенька для природы, жёсткая для персонажей.
 * @param {number} [opts.rim]           Множитель подсветки контура (0 — выключить).
 */
export function toon(color, opts = {}) {
  const { ramp = 'soft', rim = 1, ...rest } = opts
  const key = `toon|${color}|${ramp}|${rim}|${JSON.stringify(rest)}`
  let m = cache.get(key)
  if (m) return m

  m = new THREE.MeshToonMaterial({
    color,
    gradientMap: ramp === 'hard' ? ramps().rampHard : ramps().rampSoft,
    ...rest,
  })
  if (rim > 0) addRimLight(m, rim)
  cache.set(key, m)
  return m
}

/** Светящийся материал: кристаллы, огни, глаза врагов. Не принимает свет — и не должен. */
export function glow(color, opts = {}) {
  const key = `glow|${color}|${JSON.stringify(opts)}`
  let m = cache.get(key)
  if (m) return m
  m = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts })
  cache.set(key, m)
  return m
}

/** Полупрозрачный материал без записи в буфер глубины — дымка, ауры, следы. */
export function veil(color, opacity = 0.4, opts = {}) {
  const key = `veil|${color}|${opacity}|${JSON.stringify(opts)}`
  let m = cache.get(key)
  if (m) return m
  m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    ...opts,
  })
  cache.set(key, m)
  return m
}

/**
 * Вода: тун-материал с волной по вершинам и лёгкой прозрачностью.
 *
 * Волну считаем в шейдере, а не двигаем вершины на CPU: озёр на платформах
 * может быть много, и каждое — отдельная сетка, которую пришлось бы обновлять
 * покадрово.
 */
export function water(color, opts = {}) {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: ramps().rampSoft,
    transparent: true,
    opacity: 0.82,
    ...opts,
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.y += sin(transformed.x * 0.7 + uTime * 1.6) * 0.09
                        + sin(transformed.z * 0.9 - uTime * 1.1) * 0.07;`,
      )
    m.userData.shader = shader
  }
  m.customProgramCacheKey = () => 'water'
  return m
}

/** Сбрасывает кэш материалов — нужен только при полном перезапуске сцены. */
export function disposeMaterials() {
  for (const m of cache.values()) m.dispose()
  cache.clear()
}
