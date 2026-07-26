import * as THREE from 'three'
import { glow, veil, toon } from '../render/materials.js'
import { PICKUP, PLAYER, STAMINA } from './config.js'
import { clamp01, damp, TAU } from '../core/util.js'
import { createRng } from '../core/rng.js'

/**
 * Подбираемые предметы: кристаллы за очки, стамина и здоровье.
 *
 * Все притягиваются к игроку на подлёте. Это сознательная щедрость: предмет,
 * который сам прыгает в руки, ощущается наградой, а предмет, мимо которого
 * промахнулся на полметра, — наказанием. Наказаний в игре и так достаточно.
 */

function buildCrystal() {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), glow(0x6fe0ff))
  body.scale.y = 1.5
  group.add(body)
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 16), veil(0x6fe0ff, 0.35))
  halo.rotation.x = -Math.PI / 2
  group.add(halo)
  return group
}

function buildStamina() {
  const group = new THREE.Group()
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glow(0x9fff7f))
  drop.scale.y = 1.25
  group.add(drop)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), glow(0x9fff7f))
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  return group
}

function buildHeart() {
  const group = new THREE.Group()
  // «Сердце» из двух шаров и конуса — узнаётся с любого ракурса и строится
  // из тех же примитивов, что и всё остальное.
  for (const side of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), glow(0xff6b8a))
    lobe.position.set(side * 0.13, 0.12, 0)
    group.add(lobe)
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 8), glow(0xff6b8a))
  tip.position.y = -0.13
  tip.rotation.x = Math.PI
  group.add(tip)
  return group
}

const BUILDERS = { crystal: buildCrystal, stamina: buildStamina, heart: buildHeart }
const RADIUS = { crystal: PICKUP.crystalRadius, stamina: PICKUP.staminaRadius, heart: PICKUP.crystalRadius }

export function createPickups(scene) {
  const root = new THREE.Group()
  scene.add(root)

  const rng = createRng('пикапы')
  const list = []
  const pools = { crystal: [], stamina: [], heart: [] }
  const tmp = new THREE.Vector3()

  function take(kind) {
    const pool = pools[kind]
    if (pool.length) return pool.pop()
    const mesh = BUILDERS[kind]()
    root.add(mesh)
    return mesh
  }

  function spawn(kind, position) {
    const mesh = take(kind)
    mesh.visible = true
    mesh.position.set(position.x, position.y, position.z)
    list.push({
      kind,
      mesh,
      baseY: position.y,
      phase: rng.next() * TAU,
      pulled: false,
    })
  }

  function release(item) {
    item.mesh.visible = false
    pools[item.kind].push(item.mesh)
    const at = list.indexOf(item)
    if (at !== -1) list.splice(at, 1)
  }

  function collect(item, player, world) {
    const position = item.mesh.position

    switch (item.kind) {
      case 'crystal':
        world.events.emit('crystal', { position })
        world.audio.play('crystal')
        world.fx.burst(position, { count: 14, color: 0x6fe0ff, speed: 6, up: 1.2, life: 0.6 })
        break
      case 'stamina':
        player.state.stamina = Math.min(STAMINA.max, player.state.stamina + PICKUP.staminaRestore)
        world.audio.play('stamina')
        world.fx.burst(position, { count: 12, color: 0x9fff7f, speed: 5, up: 1.4 })
        break
      case 'heart':
        player.state.health = Math.min(PLAYER.maxHealth, player.state.health + 1)
        world.audio.play('stamina')
        world.fx.burst(position, { count: 16, color: 0xff6b8a, speed: 6, up: 1.4 })
        world.events.emit('heart', { position })
        break
    }
    world.fx.ring(position, { color: 0xffffff, from: 0.3, to: 2.2, life: 0.4, opacity: 0.5 })
    release(item)
  }

  function update(player, world, dt) {
    const centre = tmp.copy(player.position).setY(player.position.y + 0.9)

    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i]
      item.phase += dt

      const distance = item.mesh.position.distanceTo(centre)
      const radius = RADIUS[item.kind]

      // Зона притяжения втрое шире зоны подбора: предмет успевает заметно
      // дёрнуться к игроку, и подбор читается как действие, а не как телепорт.
      if (distance < radius * 3) {
        item.pulled = true
        item.mesh.position.x = damp(item.mesh.position.x, centre.x, 6, dt)
        item.mesh.position.y = damp(item.mesh.position.y, centre.y, 6, dt)
        item.mesh.position.z = damp(item.mesh.position.z, centre.z, 6, dt)
      } else if (!item.pulled) {
        item.mesh.position.y = item.baseY + Math.sin(item.phase * 1.8) * 0.22
      }

      item.mesh.rotation.y += dt * 1.6
      const pulse = 1 + Math.sin(item.phase * 3) * 0.07
      item.mesh.scale.setScalar(pulse)

      if (distance < radius) collect(item, player, world)
    }
  }

  function despawnBelow(y) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].mesh.position.y < y) release(list[i])
    }
  }

  function clear() {
    for (let i = list.length - 1; i >= 0; i--) release(list[i])
  }

  function dispose() {
    clear()
    scene.remove(root)
  }

  return { root, spawn, update, despawnBelow, clear, list, dispose }
}
