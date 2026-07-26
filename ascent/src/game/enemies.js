import * as THREE from 'three'
import { toon, glow } from '../render/materials.js'
import { ENEMY } from './config.js'
import { clamp, clamp01, damp, TAU } from '../core/util.js'
import { createRng } from '../core/rng.js'

/**
 * Враги трёх видов и их снаряды.
 *
 * Всё живёт в пулах: башня бесконечна, враги появляются и уходят вниз
 * непрерывно, и создавать под каждого новые меши значит гарантированно словить
 * рывок сборщика мусора в разгар забега.
 *
 * Задача врагов — не убить игрока, а сбить темп: пустая платформа впереди
 * перестаёт быть отдыхом, если на ней кто-то ходит. Поэтому все трое слабые,
 * но каждый мешает по-своему — один догоняет, другой занимает площадку,
 * третий простреливает подход.
 */

/** Летающий преследователь: тёмная капля с одним глазом и рваной юбкой. */
function buildChaser() {
  const group = new THREE.Group()

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 1), toon(0x3a2f52, { ramp: 'hard' }))
  body.scale.set(1, 1.25, 1)
  body.castShadow = true
  group.add(body)

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), glow(0xff5f6d))
  eye.position.set(0, 0.06, 0.42)
  group.add(eye)

  // Юбка из клиньев: она колышется на лету и делает силуэт живым.
  const skirt = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * TAU
    const shred = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 4), toon(0x2a2140, { ramp: 'hard' }))
    shred.position.set(Math.cos(angle) * 0.3, -0.55, Math.sin(angle) * 0.3)
    shred.rotation.x = Math.PI
    skirt.add(shred)
  }
  group.add(skirt)
  group.userData.skirt = skirt
  group.userData.eye = eye
  return group
}

/** Патрульный: приземистый четвероногий с тяжёлой челюстью. */
function buildPatrol() {
  const group = new THREE.Group()

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), toon(0x7a4a3a, { ramp: 'hard' }))
  body.scale.set(1.35, 0.85, 1)
  body.position.y = 0.52
  body.castShadow = true
  group.add(body)

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.34), toon(0x4f2f26, { ramp: 'hard' }))
  jaw.position.set(0, 0.3, 0.34)
  group.add(jaw)
  group.userData.jaw = jaw

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xffd76b))
    eye.position.set(side * 0.16, 0.62, 0.36)
    group.add(eye)
  }

  const legs = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.24, 3, 6), toon(0x4f2f26, { ramp: 'hard' }))
      leg.position.set(sx * 0.26, 0.2, sz * 0.2)
      group.add(leg)
      legs.push(leg)
    }
  }
  group.userData.legs = legs
  return group
}

/** Плевун: неподвижный, с раструбом, направленным вверх по дуге. */
function buildSpitter() {
  const group = new THREE.Group()

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.5, 7), toon(0x4a5d3a, { ramp: 'hard' }))
  base.position.y = 0.25
  base.castShadow = true
  group.add(base)

  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), toon(0x6b8a4a, { ramp: 'hard' }))
  bulb.position.y = 0.72
  bulb.castShadow = true
  group.add(bulb)

  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 6, 1, true), toon(0x3a4a2a, { ramp: 'hard' }))
  muzzle.position.y = 1.08
  group.add(muzzle)
  group.userData.muzzle = muzzle

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), glow(0xa8ff7f))
  core.position.y = 1.0
  group.add(core)
  group.userData.core = core
  return group
}

const BUILDERS = { chaser: buildChaser, patrol: buildPatrol, spitter: buildSpitter }

export function createEnemies(scene) {
  const root = new THREE.Group()
  scene.add(root)

  const rng = createRng('враги')

  /** @type {Array} Живые враги. */
  const list = []
  /** Пулы по виду: снятый враг возвращается сюда и ждёт следующего появления. */
  const pools = { chaser: [], patrol: [], spitter: [] }

  // --- Снаряды плевуна. Один общий пул на всех.
  const MAX_SHOTS = 32
  const shotGeometry = new THREE.OctahedronGeometry(0.19, 0)
  const shotMaterial = glow(0xa8ff7f)
  const shots = []
  for (let i = 0; i < MAX_SHOTS; i++) {
    const mesh = new THREE.Mesh(shotGeometry, shotMaterial)
    mesh.visible = false
    root.add(mesh)
    shots.push({ mesh, alive: false, velocity: new THREE.Vector3(), life: 0 })
  }

  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()

  function take(kind) {
    const pool = pools[kind]
    if (pool.length) return pool.pop()
    const mesh = BUILDERS[kind]()
    root.add(mesh)
    return mesh
  }

  /**
   * @param {'chaser'|'patrol'|'spitter'} kind
   * @param {{x:number,y:number,z:number}} position
   */
  function spawn(kind, position, opts = {}) {
    const mesh = take(kind)
    mesh.visible = true
    mesh.position.set(position.x, position.y, position.z)

    const enemy = {
      kind,
      mesh,
      alive: true,
      health: ENEMY[kind].health,
      velocity: new THREE.Vector3(),
      homeY: position.y,
      homeX: position.x,
      homeZ: position.z,
      phase: rng.next() * TAU,
      timer: rng.range(0, ENEMY.spitter.fireInterval),
      direction: rng.chance(0.5) ? 1 : -1,
      pause: 0,
      aggro: false,
      ...opts,
    }
    list.push(enemy)
    return enemy
  }

  function release(enemy) {
    enemy.alive = false
    enemy.mesh.visible = false
    pools[enemy.kind].push(enemy.mesh)
    const at = list.indexOf(enemy)
    if (at !== -1) list.splice(at, 1)
  }

  /** Враг погибает от рывка игрока — это награда за смелую игру. */
  function killEnemy(enemy, world) {
    world.fx.burst(enemy.mesh.position, { count: 16, color: 0xff8f6b, speed: 8, up: 1.2, life: 0.7 })
    world.fx.ring(enemy.mesh.position, { color: 0xff8f6b, from: 0.4, to: 2.4, life: 0.4, opacity: 0.7 })
    world.audio.play('enemyHit')
    release(enemy)
  }

  function fire(enemy, player) {
    const slot = shots.find((s) => !s.alive)
    if (!slot) return

    // Упреждение: целимся туда, где игрок окажется, а не где он есть.
    // Без этого плевун не попадает вовсе и превращается в декорацию.
    const cfg = ENEMY.spitter
    tmp.copy(player.position).setY(player.position.y + 0.9)
    const distance = tmp.distanceTo(enemy.mesh.position)
    const flightTime = distance / cfg.projectileSpeed
    tmp.addScaledVector(player.velocity, flightTime * 0.6)

    tmp2.copy(tmp).sub(enemy.mesh.position)
    const horizontal = Math.hypot(tmp2.x, tmp2.z)
    const time = Math.max(0.25, horizontal / cfg.projectileSpeed)
    // Вертикальную составляющую подбираем так, чтобы снаряд пришёл в точку с
    // учётом собственной гравитации — получается навесная дуга.
    const vy = (tmp2.y - 0.5 * cfg.projectileGravity * time * time) / time

    slot.alive = true
    slot.life = 4
    slot.velocity.set((tmp2.x / time), vy, (tmp2.z / time))
    slot.mesh.position.copy(enemy.mesh.position).setY(enemy.mesh.position.y + 1.1)
    slot.mesh.visible = true
  }

  function update(player, world, dt) {
    const playerCentre = tmp2.copy(player.position).setY(player.position.y + 0.9)

    for (let i = list.length - 1; i >= 0; i--) {
      const enemy = list[i]
      const cfg = ENEMY[enemy.kind]
      const toPlayer = tmp.copy(playerCentre).sub(enemy.mesh.position)
      const distance = toPlayer.length()

      switch (enemy.kind) {
        case 'chaser': {
          enemy.aggro = distance < cfg.aggroRange
          if (enemy.aggro) {
            toPlayer.normalize()
            enemy.velocity.x = damp(enemy.velocity.x, toPlayer.x * cfg.speed, cfg.acceleration, dt)
            enemy.velocity.y = damp(enemy.velocity.y, toPlayer.y * cfg.speed, cfg.acceleration, dt)
            enemy.velocity.z = damp(enemy.velocity.z, toPlayer.z * cfg.speed, cfg.acceleration, dt)
          } else {
            // Потеряв игрока, возвращается на место и покачивается — так видно,
            // что он ещё жив и снова бросится, если подойти.
            enemy.velocity.multiplyScalar(1 - Math.min(1, 2 * dt))
            enemy.mesh.position.y = damp(
              enemy.mesh.position.y,
              enemy.homeY + Math.sin(enemy.phase + world.palette.blend) * 0.4,
              1.5,
              dt,
            )
          }
          enemy.mesh.position.addScaledVector(enemy.velocity, dt)
          enemy.phase += dt * 3
          enemy.mesh.userData.skirt.rotation.y += dt * 0.8
          enemy.mesh.userData.skirt.position.y = Math.sin(enemy.phase) * 0.06
          enemy.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z)
          enemy.mesh.rotation.z = Math.sin(enemy.phase * 0.7) * 0.12
          break
        }

        case 'patrol': {
          if (enemy.pause > 0) {
            enemy.pause -= dt
          } else {
            const forwardX = Math.sin(enemy.phase) * enemy.direction
            const forwardZ = Math.cos(enemy.phase) * enemy.direction
            const nextX = enemy.mesh.position.x + forwardX * cfg.speed * dt
            const nextZ = enemy.mesh.position.z + forwardZ * cfg.speed * dt

            // Смотрим, есть ли опора там, куда собираемся шагнуть. Патрульный,
            // сходящий с платформы, — это не противник, а падающий предмет.
            const ahead = world.collision.raycastDown(
              nextX + forwardX * 0.5,
              nextZ + forwardZ * 0.5,
              enemy.mesh.position.y + 0.4,
              1.6,
            )
            if (ahead) {
              enemy.mesh.position.x = nextX
              enemy.mesh.position.z = nextZ
              enemy.mesh.position.y = ahead.y
            } else {
              enemy.direction *= -1
              enemy.pause = cfg.turnPause
            }
            enemy.mesh.rotation.y = Math.atan2(forwardX, forwardZ)
          }
          // Походка: тело подпрыгивает, челюсть жуёт.
          enemy.phase += dt
          const bob = Math.abs(Math.sin(enemy.phase * 7)) * 0.07
          enemy.mesh.children[0].position.y = 0.52 + bob
          enemy.mesh.userData.jaw.rotation.x = Math.sin(enemy.phase * 7) * 0.18
          break
        }

        case 'spitter': {
          enemy.phase += dt
          enemy.mesh.userData.core.rotation.y += dt * 2
          enemy.mesh.userData.core.position.y = 1.0 + Math.sin(enemy.phase * 2.5) * 0.05
          if (distance < cfg.aggroRange) {
            // Раструб доворачивается к цели — по нему видно, что тебя ведут.
            enemy.mesh.rotation.y = damp(
              enemy.mesh.rotation.y,
              Math.atan2(toPlayer.x, toPlayer.z),
              5,
              dt,
            )
            enemy.timer -= dt
            if (enemy.timer <= 0) {
              enemy.timer = cfg.fireInterval
              fire(enemy, player)
            }
          }
          break
        }
      }

      // Касание врага. Рывок вместо урона убивает — игрок, идущий на таран,
      // должен побеждать, иначе рывок остаётся только средством побега.
      if (distance < cfg.damageRadius + 0.4) {
        if (player.state.dashing) killEnemy(enemy, world)
        else player.damage(1, enemy.mesh.position)
      }
    }

    // --- Снаряды.
    for (const shot of shots) {
      if (!shot.alive) continue
      shot.life -= dt
      shot.velocity.y += ENEMY.spitter.projectileGravity * dt
      shot.mesh.position.addScaledVector(shot.velocity, dt)
      shot.mesh.rotation.x += dt * 6
      shot.mesh.rotation.y += dt * 4

      if (shot.mesh.position.distanceTo(playerCentre) < ENEMY.spitter.damageRadius + 0.4) {
        player.damage(1, shot.mesh.position)
        world.fx.burst(shot.mesh.position, { count: 8, color: 0xa8ff7f, speed: 5 })
        shot.alive = false
        shot.mesh.visible = false
        continue
      }

      // Снаряд гаснет по времени или уйдя под пустоту: проверять столкновение
      // со всей геометрией ради визуального эффекта не стоит.
      if (shot.life <= 0 || shot.mesh.position.y < world.hazardY) {
        shot.alive = false
        shot.mesh.visible = false
      }
    }
  }

  function despawnBelow(y) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].mesh.position.y < y) release(list[i])
    }
  }

  function clear() {
    for (let i = list.length - 1; i >= 0; i--) release(list[i])
    for (const shot of shots) {
      shot.alive = false
      shot.mesh.visible = false
    }
  }

  function dispose() {
    clear()
    shotGeometry.dispose()
    scene.remove(root)
  }

  return { root, spawn, update, despawnBelow, clear, list, dispose }
}
