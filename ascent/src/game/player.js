import * as THREE from 'three'
import { moveBody } from '../world/collision.js'
import { createTrail } from '../render/fx.js'
import { toon, glow } from '../render/materials.js'
import { PHYSICS, STAMINA, PLAYER } from './config.js'
import { clamp, clamp01, damp, dampAngle, easeOutBack, lerp, TAU } from '../core/util.js'

/**
 * Герой: физика, ощущение управления и его модель.
 *
 * Всё, что делает платформер приятным, живёт здесь и складывается из мелочей,
 * которых игрок не замечает поимённо, но мгновенно замечает их отсутствие:
 * время койота, буфер прыжка, разная гравитация на взлёте и падении,
 * приседание при посадке. Каждая из них прощает ошибку в один-два кадра —
 * ровно ту, которую человек совершает постоянно.
 */

/** Строит фигурку из примитивов и отдаёт ссылки на части для анимации. */
function buildCharacter() {
  const root = new THREE.Group()

  const skin = toon(0xf5c9a0, { ramp: 'hard' })
  const cloth = toon(0x4a7fd0, { ramp: 'hard' })
  const clothDark = toon(0x33589a, { ramp: 'hard' })
  const strap = toon(0x6b4a32, { ramp: 'hard' })

  // Тело и голова живут в отдельной группе: её мы сжимаем и растягиваем при
  // прыжках и приземлениях, не трогая ноги, которые в это время двигаются сами.
  const torsoPivot = new THREE.Group()
  root.add(torsoPivot)

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 4, 10), cloth)
  torso.position.y = 1.02
  torso.castShadow = true
  torsoPivot.add(torso)

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.29, 1), skin)
  head.position.y = 1.62
  head.castShadow = true
  torsoPivot.add(head)

  // Шапочка курьера — единственная деталь силуэта, которая читается со спины.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, TAU, 0, Math.PI / 2), clothDark)
  cap.position.y = 1.66
  cap.scale.y = 0.72
  torsoPivot.add(cap)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.18), clothDark)
  brim.position.set(0, 1.62, 0.26)
  torsoPivot.add(brim)

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(0x2a1f2e, { ramp: 'hard', rim: 0 }))
    eye.position.set(side * 0.1, 1.62, 0.25)
    torsoPivot.add(eye)
  }

  // Посылка за спиной: герой всё-таки поднимается наверх не просто так.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.24), strap)
  pack.position.set(0, 1.06, -0.3)
  pack.castShadow = true
  torsoPivot.add(pack)
  const knot = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 5, 10), toon(0xffc85c, { ramp: 'hard' }))
  knot.position.set(0, 1.06, -0.44)
  torsoPivot.add(knot)

  /** Конечность крепится к плечу/бедру, чтобы вращаться вокруг него, а не вокруг себя. */
  function limb(x, y, length, thickness, material) {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, 0)
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(thickness, length, 3, 6), material)
    mesh.position.y = -length / 2
    mesh.castShadow = true
    pivot.add(mesh)
    return pivot
  }

  const armL = limb(-0.34, 1.24, 0.36, 0.09, skin)
  const armR = limb(0.34, 1.24, 0.36, 0.09, skin)
  torsoPivot.add(armL, armR)

  const legL = limb(-0.14, 0.62, 0.44, 0.11, clothDark)
  const legR = limb(0.14, 0.62, 0.44, 0.11, clothDark)
  root.add(legL, legR)

  // Мягкая тень-пятно под ногами: она читается даже там, где карта теней
  // не достаёт, и здорово помогает целиться в платформу при падении.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 14),
    toon(0x000000, { rim: 0, transparent: true, opacity: 0.22, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.02
  root.add(blob)

  return { root, torsoPivot, torso, head, armL, armR, legL, legR, blob, materials: [skin, cloth, clothDark, strap] }
}

export function createPlayer(scene, deps) {
  const { fx, audio, camera } = deps

  const model = buildCharacter()
  scene.add(model.root)

  const trail = createTrail(scene, { length: 16, width: 0.42, color: 0x9fe8ff })

  const position = new THREE.Vector3()
  const velocity = new THREE.Vector3()
  const body = { radius: PHYSICS.radius, height: PHYSICS.height, stepHeight: PHYSICS.stepHeight }

  const state = {
    grounded: false,
    health: PLAYER.maxHealth,
    stamina: STAMINA.max,
    facing: 0,
    dashing: false,
    dead: false,
    invulnerableUntil: 0,
    maxHeight: 0,
    lastGroundY: 0,
  }

  // Внутренние таймеры. Держим отдельно от state: наружу они не нужны, а
  // светить их значит приглашать другие системы на них завязаться.
  let coyote = 0
  let jumpBuffer = 0
  let dashTimer = 0
  let dashCooldown = 0
  let staminaDelay = 0
  let doubleJumpUsed = false
  let time = 0
  let landSquash = 0
  let stepPhase = 0
  let deathTimer = 0
  /** Опора прошлого кадра — через неё физика переносит героя на движущихся платформах. */
  let lastGround = null

  const wish = new THREE.Vector3()
  const dashDirection = new THREE.Vector3(0, 0, 1)
  const tmp = new THREE.Vector3()

  function spendStamina(amount) {
    if (state.stamina < amount) return false
    state.stamina -= amount
    staminaDelay = STAMINA.regenDelay
    return true
  }

  function respawn(point) {
    position.set(point.x, point.y, point.z)
    velocity.set(0, 0, 0)
    state.health = PLAYER.maxHealth
    state.stamina = STAMINA.max
    state.dead = false
    state.dashing = false
    state.grounded = false
    state.invulnerableUntil = 0
    state.maxHeight = Math.max(0, point.y)
    state.lastGroundY = point.y
    coyote = 0
    jumpBuffer = 0
    dashTimer = 0
    dashCooldown = 0
    doubleJumpUsed = false
    deathTimer = 0
    lastGround = null
    model.root.visible = true
    model.root.position.copy(position)
  }

  /** @returns {boolean} true, если урон прошёл. */
  function damage(amount, fromPosition) {
    if (state.dead) return false
    // Рывок — окно неуязвимости: это и есть награда за агрессивную игру.
    if (state.dashing) return false
    if (time < state.invulnerableUntil) return false

    state.health -= amount
    state.invulnerableUntil = time + PLAYER.invulnerable

    if (fromPosition) {
      tmp.copy(position).sub(fromPosition)
      tmp.y = 0
      if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, 1)
      tmp.normalize().multiplyScalar(12)
      velocity.x = tmp.x
      velocity.z = tmp.z
      velocity.y = Math.max(velocity.y, 7)
    }

    audio.play(state.health <= 0 ? 'die' : 'hurt')
    fx.burst(tmp.copy(position).setY(position.y + 0.9), { count: 12, color: 0xff6b6b, speed: 7 })
    camera.addShake(0.8)

    if (state.health <= 0) kill()
    return true
  }

  function kill() {
    if (state.dead) return
    state.dead = true
    state.health = 0
    deathTimer = PLAYER.respawnDelay
    fx.burst(position, { count: 30, color: 0xff8080, speed: 11, up: 2, life: 1 })
  }

  /**
   * @param {object} input Из core/input.js
   * @param {object} world Фасад мира
   * @param {number} dt
   */
  function update(input, world, dt) {
    time += dt

    if (state.dead) {
      deathTimer -= dt
      // Модель гасим не сразу: мгновенное исчезновение читается как сбой,
      // а не как гибель.
      model.root.visible = deathTimer > 0 && Math.floor(deathTimer * 12) % 2 === 0
      return
    }

    // --- Намерение движения. Поворачиваем ввод на угол камеры: «вперёд» для
    // игрока — это всегда «от камеры», а не абсолютное направление мира.
    const yaw = camera.yaw ?? 0
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    wish.set(input.move.x * cos - input.move.y * sin, 0, -input.move.x * sin - input.move.y * cos)
    const wishLength = wish.length()
    if (wishLength > 1) wish.divideScalar(wishLength)
    const moving = wishLength > 0.08

    // --- Рывок.
    dashCooldown = Math.max(0, dashCooldown - dt)
    if (input.consumeDash() && dashCooldown <= 0 && !state.dashing && spendStamina(STAMINA.dashCost)) {
      state.dashing = true
      dashTimer = PHYSICS.dashDuration
      dashCooldown = PHYSICS.dashCooldown
      if (moving) dashDirection.copy(wish).normalize()
      else dashDirection.set(Math.sin(state.facing), 0, Math.cos(state.facing))
      audio.play('dash')
      camera.addFovKick(9)
      fx.burst(tmp.copy(position).setY(position.y + 0.8), { count: 10, color: 0x9fe8ff, speed: 5, up: 0.4 })
    }

    if (state.dashing) {
      dashTimer -= dt
      velocity.x = dashDirection.x * PHYSICS.dashSpeed
      velocity.z = dashDirection.z * PHYSICS.dashSpeed
      // Гравитация на время рывка отключена — иначе рывок вперёд превращается
      // в рывок вниз и перестаёт спасать над пропастью.
      velocity.y = 0
      trail.push(tmp.copy(position).setY(position.y + 0.9), velocity)
      if (dashTimer <= 0) {
        state.dashing = false
        // Гасим скорость на выходе, иначе рывок разгоняет героя навсегда.
        velocity.x *= 0.45
        velocity.z *= 0.45
      }
    } else {
      // --- Горизонтальный разгон.
      const accel = state.grounded ? PHYSICS.groundAccel : PHYSICS.airAccel * PHYSICS.airControl
      const targetX = wish.x * PHYSICS.runSpeed
      const targetZ = wish.z * PHYSICS.runSpeed

      if (moving) {
        velocity.x += clamp(targetX - velocity.x, -accel * dt, accel * dt)
        velocity.z += clamp(targetZ - velocity.z, -accel * dt, accel * dt)
      } else {
        const drag = state.grounded ? PHYSICS.groundFriction : PHYSICS.airDrag
        const factor = Math.max(0, 1 - drag * dt)
        velocity.x *= factor
        velocity.z *= factor
      }

      // --- Гравитация. Три режима вместо одного: подъём с зажатым прыжком
      // тянет слабее, свободное падение — сильнее. Это и даёт управляемую
      // высоту прыжка, без которой платформер ощущается ватным.
      let g = PHYSICS.gravity
      if (velocity.y < 0) g *= PHYSICS.fallGravityScale
      else if (input.jumpHeld) g *= PHYSICS.holdGravityScale
      velocity.y = Math.max(velocity.y + g * dt, PHYSICS.maxFallSpeed)
    }

    // --- Прыжок: буфер нажатия и время койота.
    if (input.consumeJump()) jumpBuffer = PHYSICS.jumpBuffer
    jumpBuffer = Math.max(0, jumpBuffer - dt)
    coyote = Math.max(0, coyote - dt)

    if (jumpBuffer > 0 && !state.dashing) {
      if (state.grounded || coyote > 0) {
        velocity.y = PHYSICS.jumpSpeed
        state.grounded = false
        coyote = 0
        jumpBuffer = 0
        doubleJumpUsed = false
        audio.play('jump')
        fx.ring(position, { color: 0xffffff, from: 0.4, to: 1.8, life: 0.28, opacity: 0.35 })
      } else if (!doubleJumpUsed && spendStamina(STAMINA.doubleJumpCost)) {
        velocity.y = PHYSICS.doubleJumpSpeed
        doubleJumpUsed = true
        jumpBuffer = 0
        audio.play('doubleJump')
        fx.ring(tmp.copy(position).setY(position.y + 0.4), {
          color: 0x9fe8ff,
          from: 0.5,
          to: 2.6,
          life: 0.4,
          opacity: 0.7,
        })
        fx.burst(position, { count: 10, color: 0x9fe8ff, speed: 6, up: 0.3 })
      }
    }

    // --- Столкновения.
    // Опору прошлого кадра передаём как переносчика: если это лифт, физика
    // сдвинет героя вместе с ним до разрешения столкновений. Иначе игрок
    // остаётся висеть в воздухе, пока платформа уезжает вверх.
    const wasGrounded = state.grounded
    const result = moveBody(world.collision, position, velocity, body, dt, {
      dropThrough: input.downHeld && jumpBuffer > 0,
      carrier: state.grounded ? lastGround : null,
    })

    state.grounded = result.grounded
    lastGround = result.ground

    if (result.grounded) {
      coyote = PHYSICS.coyoteTime
      doubleJumpUsed = false
      state.lastGroundY = position.y

      if (!wasGrounded) {
        const impact = Math.abs(result.landedSpeed)
        landSquash = clamp01(impact / 24)
        if (impact > 6) {
          audio.play('land')
          camera.addShake(clamp01(impact / 40) * 0.5)
          fx.ring(position, { color: 0xffffff, from: 0.5, to: 1.6 + impact * 0.08, life: 0.35, opacity: 0.5 })
          fx.burst(position, { count: Math.round(clamp(impact * 0.5, 3, 14)), color: 0xd8d8d8, speed: 4, up: 0.5 })
        }
      }

      // Батут подбрасывает независимо от того, держат ли прыжок.
      if (result.ground.kind === 'bounce') {
        velocity.y = PHYSICS.jumpSpeed * 1.42
        state.grounded = false
        doubleJumpUsed = false
        audio.play('bounce')
        camera.addFovKick(6)
        fx.ring(position, { color: 0xffd76b, from: 0.6, to: 3.4, life: 0.45, opacity: 0.8 })
      }

      if (result.ground.kind === 'crumble' && world.tower.triggerCrumble(result.ground.owner)) {
        audio.play('crumble')
      }
    } else if (wasGrounded && velocity.y <= 0) {
      // Сошли с края, не прыгая, — окно койота уже отсчитывается сверху.
      coyote = Math.min(coyote, PHYSICS.coyoteTime)
    }

    for (const collider of result.touched) {
      if (collider.kind === 'hazard') damage(1, tmp.set(position.x, collider.maxY, position.z))
    }

    // --- Стамина.
    staminaDelay = Math.max(0, staminaDelay - dt)
    if (staminaDelay <= 0 && state.stamina < STAMINA.max) {
      const rate = state.grounded ? (moving ? STAMINA.regenMoving : STAMINA.regen) : STAMINA.regenMoving * 0.5
      state.stamina = Math.min(STAMINA.max, state.stamina + rate * dt)
    }

    // --- Условия гибели.
    if (world.hazardY > position.y) {
      state.health = 0
      kill()
    } else if (position.y < state.lastGroundY - PLAYER.fallLimit) {
      state.health = 0
      kill()
    }

    if (position.y > state.maxHeight) state.maxHeight = position.y

    // --- Модель.
    if (moving) state.facing = dampAngle(state.facing, Math.atan2(wish.x, wish.z), 14, dt)
    updateModel(dt, moving, world)
    trail.update(state.dashing)
  }

  /** Анимация без скелета: только повороты и масштабы групп. */
  function updateModel(dt, moving, world) {
    model.root.position.copy(position)
    model.root.rotation.y = state.facing

    const speed = Math.hypot(velocity.x, velocity.z)

    // Приседание при посадке возвращается упруго — так удар читается как
    // отскок, а не как сбой анимации.
    landSquash = Math.max(0, landSquash - dt * 3.4)
    const squash = 1 - easeOutBack(1 - landSquash) * 0.22

    if (state.grounded) {
      stepPhase += speed * dt * 1.5
      const swing = Math.sin(stepPhase) * clamp01(speed / PHYSICS.runSpeed) * 0.85
      model.legL.rotation.x = swing
      model.legR.rotation.x = -swing
      model.armL.rotation.x = -swing * 0.75
      model.armR.rotation.x = swing * 0.75
      model.torsoPivot.rotation.x = clamp01(speed / PHYSICS.runSpeed) * 0.12
      // Лёгкое дыхание на месте, чтобы фигурка не выглядела манекеном.
      const breath = moving ? 0 : Math.sin(time * 2.2) * 0.02
      model.torsoPivot.scale.set(1 + breath * 0.5, squash + breath, 1 + breath * 0.5)
    } else {
      // В полёте ноги подбираются, руки идут вверх — силуэт сразу говорит,
      // что герой в воздухе.
      const rise = clamp(velocity.y / 14, -1, 1)
      model.legL.rotation.x = lerp(model.legL.rotation.x, -0.5 + rise * 0.3, 1 - Math.exp(-12 * dt))
      model.legR.rotation.x = lerp(model.legR.rotation.x, -0.2 - rise * 0.3, 1 - Math.exp(-12 * dt))
      model.armL.rotation.x = lerp(model.armL.rotation.x, -1.9 - rise * 0.5, 1 - Math.exp(-10 * dt))
      model.armR.rotation.x = lerp(model.armR.rotation.x, -1.9 - rise * 0.5, 1 - Math.exp(-10 * dt))
      model.torsoPivot.rotation.x = -rise * 0.16
      // Растяжение по вертикали на взлёте и сжатие при падении.
      const stretch = 1 + clamp(velocity.y / 40, -0.12, 0.16)
      model.torsoPivot.scale.set(2 - stretch, stretch, 2 - stretch)
    }

    if (state.dashing) {
      model.torsoPivot.rotation.x = 0.5
      model.torsoPivot.scale.set(0.86, 0.86, 1.3)
    }

    // Мигание после урона: модель то видна, то нет.
    const invulnerable = time < state.invulnerableUntil
    model.root.visible = !invulnerable || Math.floor(time * 14) % 2 === 0

    // Тень-пятно ищет опору под ногами и бледнеет с высотой падения.
    const hit = world.collision.raycastDown(position.x, position.z, position.y + 0.1, 26)
    if (hit) {
      model.blob.visible = true
      model.blob.position.y = hit.y - position.y + 0.03
      const drop = position.y - hit.y
      model.blob.material.opacity = 0.24 * (1 - clamp01(drop / 22))
      model.blob.scale.setScalar(lerp(1, 0.55, clamp01(drop / 22)))
    } else {
      model.blob.visible = false
    }
  }

  function dispose() {
    scene.remove(model.root)
    trail.dispose()
  }

  return {
    object3d: model.root,
    position,
    velocity,
    state,
    update,
    damage,
    respawn,
    dispose,
  }
}
