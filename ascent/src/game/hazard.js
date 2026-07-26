import * as THREE from 'three'
import { HAZARD } from './config.js'
import { clamp, clamp01 } from '../core/util.js'

/**
 * Поднимающаяся снизу пустота — главный источник напряжения в игре.
 *
 * Она делает две вещи. Во-первых, запрещает стоять на месте: любое промедление
 * стоит запаса высоты. Во-вторых, задаёт темп сама, а не через таймер на
 * экране, — игрок видит, сколько у него осталось, глазами.
 *
 * Ключевая тонкость баланса — догон. Если пустота движется с постоянной
 * скоростью, сильный игрок отрывается от неё навсегда и напряжение исчезает
 * вовсе; поэтому, отстав слишком далеко, она ускоряется.
 */

const SURFACE_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  varying float vDistance;

  void main() {
    vUv = uv;
    vec3 p = position;

    // Несколько синусов с несоизмеримыми частотами: у суммы нет заметного
    // периода, и поверхность не выглядит стиральной доской.
    float w = sin(p.x * 0.09 + uTime * 0.9) * 0.9
            + sin(p.y * 0.13 - uTime * 0.7) * 0.7
            + sin((p.x + p.y) * 0.05 + uTime * 1.3) * 0.5;
    vWave = w;
    p.z += w;

    // Расстояние от центра — по нему поверхность растворяется вдали.
    vDistance = length(p.xy);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const SURFACE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uVein;
  uniform vec3 uHorizon;
  uniform float uFade;
  varying vec2 vUv;
  varying float vWave;
  varying float vDistance;

  void main() {
    // Прожилки: резкая полоса там, где волна проходит через порог. Они дают
    // ощущение, что под поверхностью что-то движется.
    float vein = smoothstep(0.55, 1.0, abs(vWave));
    vec3 color = mix(uDeep, uVein, vein * 0.65);

    // Растворение вдали. Своего тумана у пустоты нет — туман сцены к ней
    // намеренно не применяется, иначе она набрала бы цвет неба и перестала
    // быть чёрной дырой. Но без растворения края огромная плоскость доходит
    // ровным фиолетовым полем до самого горизонта и читается не как пропасть
    // внизу, а как пол, накрывший весь мир. Поэтому у края она уходит в цвет
    // горизонта сама.
    float fade = smoothstep(uFade * 0.55, uFade, vDistance);
    color = mix(color, uHorizon, fade * 0.92);

    gl_FragColor = vec4(color, 1.0 - fade * 0.5);
  }
`

export function createHazard(scene) {
  const root = new THREE.Group()
  scene.add(root)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x0a0616) },
      uVein: { value: new THREE.Color(0x7b3fd4) },
      // Цвет, в который уходит даль. Ведётся палитрой, чтобы край пустоты
      // растворялся именно в том небе, которое сейчас на экране.
      uHorizon: { value: new THREE.Color(0xffd9a8) },
      uFade: { value: 210 },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    transparent: true,
    // Туман сцены намеренно не применяем: пустота обязана оставаться чёрной
    // дырой в любом биоме, а туман подмешал бы к ней цвет неба целиком.
    fog: false,
  })

  // Поверхность больше видимой дали и всегда центрируется под игроком: её край
  // не должен попадать в кадр. Дальше уFade она растворяется сама.
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 48, 48), material)
  surface.rotation.x = -Math.PI / 2
  root.add(surface)

  // Клубящаяся дымка: несколько полупрозрачных дисков, вращающихся в разные
  // стороны с разной скоростью. Дешевле частиц и читается как марево.
  const mist = []
  for (let i = 0; i < 3; i++) {
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(160 - i * 30, 160 - i * 30),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x3b1f6b : 0x5a2f9c,
        transparent: true,
        opacity: 0.2 - i * 0.045,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      }),
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 1.5 + i * 2.2
    disc.userData.speed = (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.03)
    root.add(disc)
    mist.push(disc)
  }

  // Щупальца: конусы, которые тянутся вверх и опадают. Появляются заранее и
  // прячутся, а не создаются на лету.
  const tendrils = []
  const tendrilGeometry = new THREE.ConeGeometry(0.8, 6, 6)
  const tendrilMaterial = new THREE.MeshBasicMaterial({
    color: 0x4a2280,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    fog: false,
  })
  for (let i = 0; i < 10; i++) {
    const tendril = new THREE.Mesh(tendrilGeometry, tendrilMaterial)
    tendril.visible = false
    root.add(tendril)
    tendrils.push({ mesh: tendril, phase: (i / 10) * Math.PI * 2, radius: 6 + (i % 4) * 5 })
  }

  const api = {
    root,
    y: -HAZARD.startGap,
    danger: 0,

    reset(startY) {
      api.y = startY - HAZARD.startGap
      api.danger = 0
      root.position.y = api.y
    },

    /** Цвет, в который растворяется даль. Задаётся палитрой текущей высоты. */
    setHorizon(color) {
      material.uniforms.uHorizon.value.copy(color)
    },

    /**
     * @param {number} playerY
     * @param {number} dt
     */
    update(playerY, dt) {
      material.uniforms.uTime.value += dt

      const gap = playerY - api.y

      // Скорость растёт с высотой: чем выше забрался, тем меньше права на
      // ошибку. Верхняя граница нужна, чтобы забег не обрывался мгновенно.
      let speed = clamp(
        HAZARD.baseSpeed + (Math.max(0, playerY) / 100) * HAZARD.speedPerHundred,
        HAZARD.baseSpeed,
        HAZARD.maxSpeed,
      )
      if (gap > HAZARD.catchUpDistance) speed *= HAZARD.catchUpMultiplier

      api.y += speed * dt
      api.danger = clamp01(1 - gap / HAZARD.warningDistance)

      root.position.y = api.y
      root.position.x = 0
      root.position.z = 0
      // Поверхность едет за игроком по горизонтали вместе с сеткой волны:
      // так волна не «плывёт» относительно мира при движении вбок.
      surface.position.x = 0
      surface.position.z = 0

      for (const disc of mist) {
        disc.rotation.z += disc.userData.speed * dt
        // Дымка густеет по мере приближения — предупреждение видно раньше,
        // чем становится поздно.
        disc.material.opacity = (0.16 + api.danger * 0.22) * (1 - mist.indexOf(disc) * 0.22)
      }

      for (const t of tendrils) {
        t.phase += dt * 0.8
        const reach = Math.sin(t.phase)
        // Щупальца показываются только когда пустота близко: пока она далеко,
        // они лишь засоряли бы кадр.
        t.mesh.visible = api.danger > 0.15 && reach > 0
        if (!t.mesh.visible) continue
        const angle = t.phase * 0.3 + t.radius
        t.mesh.position.set(Math.cos(angle) * t.radius, reach * 4 * (0.4 + api.danger), Math.sin(angle) * t.radius)
        t.mesh.scale.setScalar(0.5 + reach * 0.8)
        t.mesh.material.opacity = 0.45 * reach * api.danger
      }
    },

    dispose() {
      surface.geometry.dispose()
      material.dispose()
      tendrilGeometry.dispose()
      tendrilMaterial.dispose()
      for (const disc of mist) {
        disc.geometry.dispose()
        disc.material.dispose()
      }
      scene.remove(root)
    },
  }

  return api
}
