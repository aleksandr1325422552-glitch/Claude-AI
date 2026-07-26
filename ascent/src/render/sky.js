import * as THREE from 'three'
import { createRng } from '../core/rng.js'

/**
 * Небо: градиентный купол, звёзды и слои облаков.
 *
 * Купол — обычная сфера, вывернутая наизнанку, с градиентом в шейдере. Он же
 * задаёт цвет тумана, поэтому геометрия у горизонта растворяется точно в фон, и
 * граница подгружённого мира не видна.
 *
 * Всё небо ездит за камерой, но не вращается вместе с ней — иначе звёзды
 * «прилипли» бы к взгляду и высота перестала бы читаться.
 */

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDirection;
  void main() {
    // Направление от центра купола к вершине — им и красим градиент.
    vWorldDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunGlow;
  varying vec3 vWorldDirection;

  void main() {
    vec3 dir = normalize(vWorldDirection);

    // Градиент по высоте. Степень 0.55 поднимает переход выше горизонта:
    // при линейном смешивании тёплая полоса выходит слишком узкой.
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uBottom, uTop, pow(h, 0.55));

    // Мягкое зарево вокруг солнца — без него направленный свет не мотивирован.
    float sun = pow(clamp(dot(dir, normalize(uSunDirection)), 0.0, 1.0), 8.0);
    color += uSunColor * sun * uSunGlow;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * Звёздное поле.
 *
 * Точки раскиданы по сфере равномерно (через равномерную выборку по косинусу
 * широты, иначе они сгущаются у полюсов). Прозрачность звёзд ведёт палитра:
 * внизу их не видно вовсе, в «Звёздном пределе» — в полную силу.
 */
function createStars(count = 1400, radius = 480) {
  const rng = createRng('stars')
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const u = rng.next() * 2 - 1
    const theta = rng.next() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    // Нижнюю полусферу поджимаем: под ногами звёзды всё равно закрыты миром.
    const y = u * 0.5 + 0.5
    positions[i * 3 + 0] = Math.cos(theta) * r * radius
    positions[i * 3 + 1] = y * radius
    positions[i * 3 + 2] = Math.sin(theta) * r * radius
    sizes[i] = rng.range(0.6, 2.4)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      void main() {
        // Мерцание: у каждой звезды своя фаза, взятая из её координат.
        vTwinkle = 0.65 + 0.35 * sin(uTime * 1.7 + position.x * 0.21 + position.z * 0.13);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        // Круглая точка с мягким краем вместо квадрата спрайта.
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.15, d) * uOpacity * vTwinkle;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  return new THREE.Points(geometry, material)
}

/**
 * Облачные слои.
 *
 * Каждое облако — сплюснутая многогранная «клякса», а не спрайт: у башни
 * камера свободно вращается, и плоские билборды выдали бы себя мгновенно.
 * Слои расставлены по высоте и медленно дрейфуют по кругу.
 */
function createClouds(layers = 7, perLayer = 9) {
  const rng = createRng('clouds')
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: false,
  })

  // Одна геометрия на все облака: форму разнообразим неравномерным масштабом.
  const blobGeometry = new THREE.IcosahedronGeometry(1, 1)

  for (let layer = 0; layer < layers; layer++) {
    const ring = new THREE.Group()
    ring.userData.speed = rng.range(0.008, 0.03) * (rng.chance(0.5) ? 1 : -1)
    ring.userData.baseY = layer * 240 + rng.range(-40, 40)

    for (let i = 0; i < perLayer; i++) {
      const cloud = new THREE.Group()
      const angle = (i / perLayer) * Math.PI * 2 + rng.spread(0.3)
      const dist = rng.range(90, 240)
      cloud.position.set(Math.cos(angle) * dist, rng.spread(30), Math.sin(angle) * dist)

      // Три-четыре шара, сдвинутых относительно друг друга, читаются как облако.
      const puffs = rng.int(3, 5)
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(blobGeometry, material)
        puff.position.set(rng.spread(14), rng.spread(3), rng.spread(9))
        puff.scale.set(rng.range(8, 17), rng.range(3.5, 6.5), rng.range(7, 13))
        cloud.add(puff)
      }
      ring.add(cloud)
    }
    group.add(ring)
  }

  group.userData.material = material
  return group
}

/**
 * Собирает небо и отдаёт объект с методом обновления.
 *
 * @param {THREE.Scene} scene
 */
export function createSky(scene) {
  const root = new THREE.Group()
  // Небо рисуется первым и не пишет глубину — всё остальное ложится поверх.
  root.renderOrder = -1
  scene.add(root)

  const domeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0x5fb8e8) },
      uBottom: { value: new THREE.Color(0xffd9a8) },
      uSunColor: { value: new THREE.Color(0xfff2d4) },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.6, 0.35).normalize() },
      uSunGlow: { value: 0.5 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), domeMaterial)
  root.add(dome)

  const stars = createStars()
  root.add(stars)

  const clouds = createClouds()
  root.add(clouds)

  /**
   * @param {object} palette   Состояние палитры (см. render/palette.js).
   * @param {THREE.Vector3} cameraPosition
   * @param {number} elapsed   Общее время в секундах.
   * @param {number} dt        Шаг кадра в секундах.
   */
  function update(palette, cameraPosition, elapsed, dt) {
    domeMaterial.uniforms.uTop.value.copy(palette.skyTop)
    domeMaterial.uniforms.uBottom.value.copy(palette.skyBottom)
    domeMaterial.uniforms.uSunColor.value.copy(palette.sun)
    // В грозу и пустоту зарево гасим — там нет источника, который бы его давал.
    domeMaterial.uniforms.uSunGlow.value = 0.55 * (1 - palette.starOpacity * 0.85)

    root.position.copy(cameraPosition)

    stars.material.uniforms.uOpacity.value = palette.starOpacity
    stars.material.uniforms.uTime.value = elapsed

    // Облака живут в мировых координатах по высоте: купол едет за камерой, а
    // они должны оставаться на своих ярусах, иначе подъём не чувствуется.
    for (const ring of clouds.children) {
      ring.rotation.y += ring.userData.speed * dt
      ring.position.y = ring.userData.baseY - cameraPosition.y
    }
    // Выше облачного пояса дымка редеет, у ледника её почти нет.
    clouds.userData.material.opacity = 0.15 + 0.45 * (1 - palette.starOpacity)
  }

  /** Плотность точек зависит от разрешения — иначе на Retina звёзды исчезают. */
  function setPixelRatio(ratio) {
    stars.material.uniforms.uPixelRatio.value = ratio
  }

  return { root, update, setPixelRatio }
}
