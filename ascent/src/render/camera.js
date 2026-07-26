import * as THREE from 'three'
import { clamp, damp, dampAngle, lerp, shortestAngle } from '../core/util.js'

/**
 * Камера от третьего лица для вертикального подъёма.
 *
 * Обычная камера-«поводок» на башне не работает: игрок всё время движется
 * вверх, и если держать его в центре кадра, не видно ни следующей платформы,
 * ни того, насколько близко подобралась пустота снизу. Поэтому здесь три
 * поправки поверх простого следования:
 *
 *  1. Взгляд смещён вверх — впереди по курсу всегда видно, куда прыгать.
 *  2. При падении камера отстаёт по высоте мягче, чем при подъёме: резкое
 *     падение не должно выбрасывать героя за верхний край экрана.
 *  3. Угол вокруг башни подтягивается к направлению движения, но с большой
 *     задержкой — иначе кадр крутит на каждом шаге вбок.
 */

/** Пределы дистанции и подъёма камеры при зуме колесом. */
const DISTANCE = { min: 6, max: 18, default: 11 }

export function createCameraRig(camera) {
  // Желаемое состояние, к которому камера сходится каждый кадр.
  const target = new THREE.Vector3()
  const smoothed = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  const smoothedLook = new THREE.Vector3()

  let yaw = 0
  let distance = DISTANCE.default
  let desiredDistance = DISTANCE.default
  let pitch = 0.28
  let initialised = false

  // Тряска: амплитуда затухает, направление берём из шума по времени.
  let shake = 0
  let shakeTime = 0

  // Дополнительный угол обзора — «толчок» на рывке, возвращается к нулю.
  let fovKick = 0
  const baseFov = camera.fov

  const offset = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  /** Мгновенно ставит камеру в нужную точку — при старте и после респауна. */
  function snap(position, facing = 0) {
    yaw = facing
    initialised = false
    target.copy(position)
    smoothed.copy(position)
    smoothedLook.copy(position)
  }

  /** Тряска кадра: `amount` в условных единицах, 1 — сильный удар. */
  function addShake(amount) {
    shake = Math.min(shake + amount, 1.6)
  }

  /** Толчок угла обзора: положительный расширяет кадр (ускорение). */
  function addFovKick(amount) {
    fovKick = clamp(fovKick + amount, -8, 16)
  }

  /** Колесо мыши приближает и отдаляет камеру. */
  function zoom(delta) {
    desiredDistance = clamp(desiredDistance + delta, DISTANCE.min, DISTANCE.max)
  }

  /**
   * @param {object} focus
   * @param {THREE.Vector3} focus.position  Позиция игрока.
   * @param {THREE.Vector3} focus.velocity  Его скорость — ею ведём угол и подъём взгляда.
   * @param {number} focus.facing           Куда смотрит герой (радианы).
   * @param {number} [focus.lookAhead]      Насколько поднять взгляд (0..1).
   * @param {number} dt
   */
  function update(focus, dt) {
    const { position, velocity, facing } = focus
    const lookAhead = focus.lookAhead ?? 0

    // Угол вокруг башни ведём за направлением взгляда героя, но лениво.
    // Порог в четверть радиана гасит мелкие подёргивания на месте.
    if (Math.abs(shortestAngle(yaw, facing)) > 0.25) {
      yaw = dampAngle(yaw, facing, 2.2, dt)
    }

    distance = damp(distance, desiredDistance, 6, dt)

    // Падение — камера отпускает героя вниз медленнее, чем поднимается за ним.
    const falling = velocity.y < 0
    const verticalLambda = falling ? 3.4 : 7.5

    // Точка, за которой едем: позиция героя плюс подъём взгляда вперёд по курсу.
    target.set(position.x, position.y + 2.1 + lookAhead * 2.4, position.z)

    if (!initialised) {
      smoothed.copy(target)
      initialised = true
    }
    smoothed.x = damp(smoothed.x, target.x, 8, dt)
    smoothed.z = damp(smoothed.z, target.z, 8, dt)
    smoothed.y = damp(smoothed.y, target.y, verticalLambda, dt)

    // Камера стоит позади героя относительно его направления и чуть выше.
    const height = lerp(3.4, 5.2, clamp(lookAhead, 0, 1))
    offset.set(Math.sin(yaw) * -distance, height + pitch * distance, Math.cos(yaw) * -distance)
    camera.position.copy(smoothed).add(offset)

    // Смотрим чуть выше героя — так в кадр попадает следующая платформа.
    lookAt.set(position.x, position.y + 1.6 + lookAhead * 3.2, position.z)
    smoothedLook.x = damp(smoothedLook.x, lookAt.x, 9, dt)
    smoothedLook.y = damp(smoothedLook.y, lookAt.y, falling ? 4 : 8, dt)
    smoothedLook.z = damp(smoothedLook.z, lookAt.z, 9, dt)

    if (shake > 0.001) {
      shakeTime += dt * 34
      // Разные частоты по осям — тряска не выглядит как качание маятника.
      tmp.set(Math.sin(shakeTime) * 0.6, Math.sin(shakeTime * 1.7 + 1.3) * 0.45, Math.cos(shakeTime * 1.3) * 0.6)
      camera.position.addScaledVector(tmp, shake)
      shake = Math.max(0, shake - dt * 2.6)
    }

    camera.lookAt(smoothedLook)

    // Угол обзора возвращается к базовому — толчок ощущается как ускорение.
    fovKick = damp(fovKick, 0, 3.5, dt)
    const speedFov = clamp(Math.abs(velocity.y) * 0.16, 0, 6)
    const wanted = baseFov + fovKick + speedFov
    if (Math.abs(camera.fov - wanted) > 0.01) {
      camera.fov = damp(camera.fov, wanted, 8, dt)
      camera.updateProjectionMatrix()
    }
  }

  return {
    update,
    snap,
    addShake,
    addFovKick,
    zoom,
    get yaw() {
      return yaw
    },
    set yaw(v) {
      yaw = v
    },
  }
}
