import * as THREE from 'three'
import { createPalette } from './palette.js'
import { createSky } from './sky.js'
import { sharedUniforms } from './materials.js'

/**
 * Сцена, рендерер, свет и всё, что красит кадр.
 *
 * Ключевая особенность — свет и тени ездят за игроком. Башня бесконечна, и
 * теневая карта, растянутая на весь мир, дала бы кашу из пикселей; вместо этого
 * она покрывает небольшой объём вокруг героя и переезжает вместе с ним.
 */

/** Пресеты качества. Мобильные видеокарты не тянут тени 2048 и полный пиксель-ратио. */
export const QUALITY = {
  low: { shadowMap: 0, pixelRatio: 1, shadows: false, starCount: 600 },
  medium: { shadowMap: 1024, pixelRatio: 1.5, shadows: true, starCount: 1000 },
  high: { shadowMap: 2048, pixelRatio: 2, shadows: true, starCount: 1400 },
}

/** Выбирает качество по устройству: у мобильных обычно узкая шина памяти. */
export function detectQuality() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency || 4
  if (mobile || cores <= 4) return 'low'
  return cores >= 8 ? 'high' : 'medium'
}

/**
 * Размер игрового поля.
 *
 * Спрашиваем контейнер, но не верим ему безоговорочно: во встроенном кадре он
 * вполне может сообщить ноль, пока вёрстка ещё не устоялась. Нулевой размер
 * даёт вырожденную матрицу проекции и чёрный экран без единой ошибки в консоли
 * — то есть поломку, которую нечем заметить. Окно в такой ситуации честнее.
 */
function viewportSize(container) {
  const width = container.clientWidth || window.innerWidth || 1
  const height = container.clientHeight || window.innerHeight || 1
  return { width, height }
}

/**
 * @param {HTMLElement} container Куда вставить канвас.
 * @param {keyof QUALITY} qualityName
 */
export function createRenderer(container, qualityName = 'high') {
  const quality = QUALITY[qualityName] ?? QUALITY.high
  const initial = viewportSize(container)

  const renderer = new THREE.WebGLRenderer({
    antialias: qualityName !== 'low',
    powerPreference: 'high-performance',
    stencil: false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio))
  renderer.setSize(initial.width, initial.height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // ACES слишком «киношный» для мультяшной картинки — гасит насыщенность.
  // Линейный маппинг с лёгкой экспозицией оставляет цвета такими, как в палитре.
  renderer.toneMapping = THREE.LinearToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0xffd9a8, 0.0042)

  const camera = new THREE.PerspectiveCamera(58, initial.width / initial.height, 0.1, 1200)
  camera.position.set(0, 6, 14)

  const palette = createPalette()
  const sky = createSky(scene)
  sky.setPixelRatio(renderer.getPixelRatio())

  // Направленный свет — «солнце». Цель держим отдельным объектом: three берёт
  // направление как разницу позиции и target, и обе точки надо возить за игроком.
  const sun = new THREE.DirectionalLight(0xfff2d4, 1.55)
  const sunOffset = new THREE.Vector3(38, 54, 26)
  sun.position.copy(sunOffset)
  sun.castShadow = quality.shadows
  if (quality.shadows) {
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap)
    const extent = 34
    sun.shadow.camera.left = -extent
    sun.shadow.camera.right = extent
    sun.shadow.camera.top = extent
    sun.shadow.camera.bottom = -extent
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 170
    // Смещение убирает «полосы» самозатенения на пологих поверхностях,
    // normalBias — на крутых боках скал.
    sun.shadow.bias = -0.0009
    sun.shadow.normalBias = 0.035
  }
  scene.add(sun)
  scene.add(sun.target)

  const ambient = new THREE.HemisphereLight(0x9fc7e8, 0x6a5a48, 0.85)
  scene.add(ambient)

  const clock = new THREE.Clock()
  let elapsed = 0

  /**
   * Обновляет всё оформление под положение камеры и высоту игрока.
   *
   * @param {number} height        Высота игрока в метрах — ведёт палитру.
   * @param {THREE.Vector3} focus  Точка, вокруг которой держим тени.
   * @param {number} dt
   */
  function update(height, focus, dt) {
    elapsed += dt
    sharedUniforms.uTime.value = elapsed

    const p = palette.update(height)

    scene.fog.color.copy(p.fog)
    scene.fog.density = p.fogDensity

    sun.color.copy(p.sun)
    sun.intensity = p.sunIntensity
    ambient.color.copy(p.ambient)
    ambient.groundColor.copy(p.rockDeep)
    ambient.intensity = p.ambientIntensity

    // Тень «привязана» к игроку с округлением до половины метра. Без округления
    // теневая карта дрожит на месте: каждый кадр она сдвигается на доли текселя.
    const snap = 0.5
    sun.target.position.set(
      Math.round(focus.x / snap) * snap,
      Math.round(focus.y / snap) * snap,
      Math.round(focus.z / snap) * snap,
    )
    sun.position.copy(sun.target.position).add(sunOffset)

    // Ободок красим цветом неба: он изображает свет, отражённый от небосвода.
    sharedUniforms.uRimColor.value.copy(p.skyTop).lerp(p.sun, 0.35)
    sharedUniforms.uRimStrength.value = 0.28 + p.starOpacity * 0.3

    sky.update(p, camera.position, elapsed, dt)
    return p
  }

  function render() {
    renderer.render(scene, camera)
  }

  function resize() {
    const { width: w, height: h } = viewportSize(container)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    sky.setPixelRatio(renderer.getPixelRatio())
  }

  window.addEventListener('resize', resize)

  function dispose() {
    window.removeEventListener('resize', resize)
    renderer.dispose()
    renderer.domElement.remove()
  }

  return {
    renderer,
    scene,
    camera,
    sun,
    ambient,
    palette,
    quality,
    qualityName,
    clock,
    update,
    render,
    resize,
    dispose,
    get elapsed() {
      return elapsed
    },
  }
}
