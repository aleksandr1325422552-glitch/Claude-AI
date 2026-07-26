import * as THREE from 'three'
import { clamp01, easeOutCubic } from '../core/util.js'
import { createRng } from '../core/rng.js'

/**
 * Эффекты: искры, кольца удара, всплывающие цифры и шлейф за героем.
 *
 * Всё сделано на пулах заранее созданных объектов. Эффекты рождаются пачками —
 * приземление, рывок, подбор кристалла, — и создавать под каждый новый меш
 * значит ловить рывок сборщика мусора ровно в момент, когда игрок прыгает.
 * Здесь объекты только прячутся и достаются заново.
 */

const MAX_SPARKS = 220
const MAX_RINGS = 24

export function createFx(scene) {
  const rng = createRng('fx')
  const root = new THREE.Group()
  scene.add(root)

  // --- Искры: один InstancedMesh на всё, позиции обновляем в матрицах.
  const sparkGeometry = new THREE.TetrahedronGeometry(0.16, 0)
  const sparkMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true })
  const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, MAX_SPARKS)
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  sparks.frustumCulled = false
  sparks.count = MAX_SPARKS
  sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPARKS * 3), 3)
  root.add(sparks)

  const sparkPool = []
  for (let i = 0; i < MAX_SPARKS; i++) {
    sparkPool.push({
      alive: false,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      color: new THREE.Color(),
      life: 0,
      maxLife: 1,
      size: 1,
      gravity: -18,
    })
  }

  const dummy = new THREE.Object3D()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

  // --- Кольца удара: плоские торы, которые расширяются и гаснут.
  const ringGeometry = new THREE.RingGeometry(0.5, 0.62, 28)
  const ringPool = []
  for (let i = 0; i < MAX_RINGS; i++) {
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(ringGeometry, material)
    mesh.visible = false
    mesh.rotation.x = -Math.PI / 2
    root.add(mesh)
    ringPool.push({ mesh, material, alive: false, life: 0, maxLife: 0.5, from: 1, to: 4, vertical: false })
  }

  /**
   * Пучок искр.
   *
   * @param {THREE.Vector3} position
   * @param {object} [opts]
   * @param {number} [opts.count]    Сколько частиц.
   * @param {number|THREE.Color} [opts.color]
   * @param {number} [opts.speed]    Начальная скорость разлёта.
   * @param {number} [opts.spread]   Разброс по горизонтали (1 — полусфера).
   * @param {number} [opts.up]       Смещение разлёта вверх.
   * @param {number} [opts.life]     Время жизни в секундах.
   * @param {number} [opts.size]
   * @param {number} [opts.gravity]
   */
  function burst(position, opts = {}) {
    const {
      count = 12,
      color = 0xffffff,
      speed = 6,
      spread = 1,
      up = 1,
      life = 0.6,
      size = 1,
      gravity = -18,
    } = opts

    let spawned = 0
    for (const p of sparkPool) {
      if (spawned >= count) break
      if (p.alive) continue
      p.alive = true
      p.position.copy(position)
      const angle = rng.next() * Math.PI * 2
      const radial = rng.range(0.4, 1) * speed * spread
      p.velocity.set(Math.cos(angle) * radial, rng.range(0.2, 1) * speed * up, Math.sin(angle) * radial)
      p.spin.set(rng.spread(12), rng.spread(12), rng.spread(12))
      p.rotation.set(rng.next() * 6.28, rng.next() * 6.28, rng.next() * 6.28)
      p.color.set(color)
      p.life = 0
      p.maxLife = life * rng.range(0.7, 1.2)
      p.size = size * rng.range(0.6, 1.3)
      p.gravity = gravity
      spawned++
    }
  }

  /**
   * Расширяющееся кольцо — приземление, взрыв, волна от врага.
   *
   * @param {THREE.Vector3} position
   * @param {object} [opts]
   * @param {boolean} [opts.vertical] Поставить кольцо вертикально (удар в стену).
   */
  function ring(position, opts = {}) {
    const { color = 0xffffff, from = 0.6, to = 4, life = 0.45, opacity = 0.8, vertical = false } = opts
    const slot = ringPool.find((r) => !r.alive)
    if (!slot) return
    slot.alive = true
    slot.life = 0
    slot.maxLife = life
    slot.from = from
    slot.to = to
    slot.opacity = opacity
    slot.mesh.position.copy(position)
    slot.mesh.rotation.x = vertical ? 0 : -Math.PI / 2
    slot.mesh.visible = true
    slot.material.color.set(color)
    slot.material.opacity = opacity
    slot.mesh.scale.setScalar(from)
  }

  /** Столб искр вверх — телепорт, чекпойнт, финиш этапа. */
  function pillar(position, color = 0x6fffe0) {
    burst(position, { count: 26, color, speed: 9, spread: 0.35, up: 3.4, life: 1.1, gravity: -6 })
    ring(position, { color, from: 0.4, to: 5.5, life: 0.7, opacity: 0.9 })
  }

  function update(dt) {
    // Искры: интегрируем, гасим, перекладываем в матрицы инстансов.
    let index = 0
    for (const p of sparkPool) {
      if (!p.alive) {
        sparks.setMatrixAt(index, hidden)
        index++
        continue
      }
      p.life += dt
      if (p.life >= p.maxLife) {
        p.alive = false
        sparks.setMatrixAt(index, hidden)
        index++
        continue
      }
      p.velocity.y += p.gravity * dt
      // Сопротивление воздуха: без него искры улетают слишком далеко и ровно.
      p.velocity.multiplyScalar(1 - Math.min(1, 2.2 * dt))
      p.position.addScaledVector(p.velocity, dt)
      p.rotation.x += p.spin.x * dt
      p.rotation.y += p.spin.y * dt
      p.rotation.z += p.spin.z * dt

      const t = clamp01(p.life / p.maxLife)
      const scale = p.size * (1 - easeOutCubic(t) * 0.85)
      dummy.position.copy(p.position)
      dummy.rotation.copy(p.rotation)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      sparks.setMatrixAt(index, dummy.matrix)
      sparks.setColorAt(index, p.color)
      index++
    }
    sparks.instanceMatrix.needsUpdate = true
    if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true

    for (const r of ringPool) {
      if (!r.alive) continue
      r.life += dt
      const t = clamp01(r.life / r.maxLife)
      if (t >= 1) {
        r.alive = false
        r.mesh.visible = false
        continue
      }
      const eased = easeOutCubic(t)
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * eased)
      r.material.opacity = r.opacity * (1 - eased)
    }
  }

  function dispose() {
    sparkGeometry.dispose()
    sparkMaterial.dispose()
    ringGeometry.dispose()
    for (const r of ringPool) r.material.dispose()
    scene.remove(root)
  }

  return { root, burst, ring, pillar, update, dispose }
}

/**
 * Шлейф за героем при рывке.
 *
 * Лента из полос, которая тянется по недавним позициям. Держим её отдельно от
 * искр: у шлейфа своя геометрия, которая переписывается каждый кадр целиком.
 */
export function createTrail(scene, { length = 18, width = 0.55, color = 0x9fe8ff } = {}) {
  const positions = new Float32Array(length * 2 * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  // Полосу собираем из четырёхугольников между соседними точками истории.
  const indices = []
  for (let i = 0; i < length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geometry.setIndex(indices)

  const alphas = new Float32Array(length * 2)
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor, vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)

  const history = []
  const up = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3()
  const dir = new THREE.Vector3()

  /** Добавляет точку в историю; вызывать, пока шлейф активен. */
  function push(position, velocity) {
    history.unshift({ position: position.clone(), velocity: velocity.clone() })
    if (history.length > length) history.pop()
  }

  function update(visible) {
    mesh.visible = visible && history.length >= 2
    if (!mesh.visible) {
      if (!visible) history.length = 0
      return
    }
    for (let i = 0; i < length; i++) {
      const point = history[Math.min(i, history.length - 1)]
      dir.copy(point.velocity).normalize()
      side.crossVectors(dir, up).normalize().multiplyScalar(width * (1 - i / length))
      const o = i * 6
      positions[o + 0] = point.position.x + side.x
      positions[o + 1] = point.position.y + side.y
      positions[o + 2] = point.position.z + side.z
      positions[o + 3] = point.position.x - side.x
      positions[o + 4] = point.position.y - side.y
      positions[o + 5] = point.position.z - side.z
      const alpha = (1 - i / length) ** 2
      alphas[i * 2] = alpha
      alphas[i * 2 + 1] = alpha
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
  }

  function dispose() {
    geometry.dispose()
    material.dispose()
    scene.remove(mesh)
  }

  return { mesh, push, update, dispose }
}
