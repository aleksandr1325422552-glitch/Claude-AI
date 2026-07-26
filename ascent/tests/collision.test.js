import test from 'node:test'
import assert from 'node:assert/strict'
import { createCollisionWorld, makeCollider, moveCollider, moveBody } from '../src/world/collision.js'

/**
 * Физика столкновений — фундамент игры: ошибка здесь роняет игрока сквозь мир
 * или подвешивает его в воздухе. Поэтому проверяем не «работает ли вообще»,
 * а конкретные ситуации, в которых легко ошибиться.
 */

const BODY = { radius: 0.4, height: 1.7, stepHeight: 0.45 }

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z })

/** Мир с одной платформой 10×1×10, верх которой на y=0. */
function groundWorld() {
  const world = createCollisionWorld()
  world.add(makeCollider(0, -0.5, 0, 10, 1, 10, 'solid'))
  return world
}

test('падающее тело встаёт на платформу, а не проваливается сквозь неё', () => {
  const world = groundWorld()
  const position = vec(0, 4, 0)
  const velocity = vec(0, -12, 0)

  let result
  for (let i = 0; i < 30; i++) {
    result = moveBody(world, position, velocity, BODY, 1 / 60)
    if (result.grounded) break
  }

  assert.equal(result.grounded, true, 'тело должно оказаться на земле')
  assert.equal(position.y, 0, 'ноги должны стоять ровно на верхней грани')
  assert.equal(velocity.y, 0, 'вертикальная скорость гасится при посадке')
})

test('скорость удара при посадке доходит до вызывающей стороны', () => {
  const world = groundWorld()
  const position = vec(0, 0.2, 0)
  const velocity = vec(0, -20, 0)

  const result = moveBody(world, position, velocity, BODY, 1 / 60)
  assert.equal(result.grounded, true)
  assert.ok(result.landedSpeed < -10, `ожидалась заметная скорость удара, получено ${result.landedSpeed}`)
})

test('тело скользит вдоль стены, а не залипает в ней', () => {
  const world = groundWorld()
  // Стена вдоль оси Z справа от начала координат.
  world.add(makeCollider(3, 1.5, 0, 1, 4, 10, 'solid'))

  const position = vec(0, 0, 0)
  const velocity = vec(8, 0, 6)
  moveBody(world, position, velocity, BODY, 1 / 60)

  // Упёрлись по X, но движение по Z продолжается — это и есть скольжение.
  for (let i = 0; i < 30; i++) {
    velocity.x = 8
    velocity.z = 6
    velocity.y = -1
    moveBody(world, position, velocity, BODY, 1 / 60)
  }

  assert.ok(position.x <= 2.5 + 1e-6, `тело не должно пройти сквозь стену, x=${position.x}`)
  assert.ok(position.z > 1, `движение вдоль стены должно продолжаться, z=${position.z}`)
})

test('проходимая платформа пропускает снизу и держит сверху', () => {
  const world = createCollisionWorld()
  world.add(makeCollider(0, 0, 0, 8, 0.4, 8, 'oneway'))

  // Снизу вверх — проходим насквозь.
  const rising = vec(0, -3, 0)
  const risingVelocity = vec(0, 14, 0)
  for (let i = 0; i < 20; i++) moveBody(world, rising, risingVelocity, BODY, 1 / 60)
  assert.ok(rising.y > 0.2, `тело должно пройти сквозь платформу снизу, y=${rising.y}`)

  // Сверху вниз — встаём на неё.
  const falling = vec(0, 3, 0)
  const fallingVelocity = vec(0, -10, 0)
  let result
  for (let i = 0; i < 40; i++) {
    result = moveBody(world, falling, fallingVelocity, BODY, 1 / 60)
    if (result.grounded) break
  }
  assert.equal(result.grounded, true, 'сверху проходимая платформа должна быть опорой')
})

test('dropThrough позволяет спрыгнуть с проходимой платформы', () => {
  const world = createCollisionWorld()
  world.add(makeCollider(0, 0, 0, 8, 0.4, 8, 'oneway'))

  const position = vec(0, 0.2, 0)
  const velocity = vec(0, -2, 0)
  for (let i = 0; i < 30; i++) {
    velocity.y -= 0.3
    moveBody(world, position, velocity, BODY, 1 / 60, { dropThrough: true })
  }
  assert.ok(position.y < -0.5, `с dropThrough тело должно уйти вниз, y=${position.y}`)
})

test('шипы не блокируют движение, но попадают в список задетого', () => {
  const world = groundWorld()
  world.add(makeCollider(0, 0.5, 0, 1, 1, 1, 'hazard'))

  const position = vec(0, 0, 0)
  const velocity = vec(0, -1, 0)
  const result = moveBody(world, position, velocity, BODY, 1 / 60)

  assert.ok(
    result.touched.some((c) => c.kind === 'hazard'),
    'шип должен попасть в touched',
  )
  assert.equal(result.grounded, true, 'шип не должен мешать стоять на платформе')
})

test('движущаяся платформа переносит стоящее на ней тело', () => {
  const world = createCollisionWorld()
  const owner = { velocity: { x: 0, y: 3, z: 0 } }
  const collider = makeCollider(0, -0.5, 0, 10, 1, 10, 'solid', owner)
  world.add(collider)

  const position = vec(0, 0, 0)
  const velocity = vec(0, 0, 0)
  const dt = 1 / 60
  const before = position.y

  // Платформа и её коллайдер обязаны ехать вместе — так их и двигает
  // генератор. Тело едет следом за счёт owner.velocity.
  let centre = -0.5
  for (let i = 0; i < 10; i++) {
    centre += owner.velocity.y * dt
    moveCollider(collider, 0, centre, 0)
    moveBody(world, position, velocity, BODY, dt, { carrier: collider })
  }

  assert.ok(position.y > before + 0.3, `лифт должен поднять тело, было ${before}, стало ${position.y}`)
  assert.ok(
    Math.abs(position.y - (centre + 0.5)) < 0.05,
    `тело должно остаться на верхней грани платформы: тело ${position.y}, грань ${centre + 0.5}`,
  )
})

test('стоящее тело не проваливается сквозь опускающуюся платформу', () => {
  const world = createCollisionWorld()
  const owner = { velocity: { x: 0, y: -3, z: 0 } }
  const collider = makeCollider(0, -0.5, 0, 10, 1, 10, 'solid', owner)
  world.add(collider)

  const position = vec(0, 0, 0)
  const velocity = vec(0, 0, 0)
  const dt = 1 / 60

  let centre = -0.5
  for (let i = 0; i < 20; i++) {
    centre += owner.velocity.y * dt
    moveCollider(collider, 0, centre, 0)
    velocity.y -= 34 * dt
    moveBody(world, position, velocity, BODY, dt, { carrier: collider })
  }

  assert.ok(
    Math.abs(position.y - (centre + 0.5)) < 0.12,
    `тело должно ехать вниз вместе с платформой: тело ${position.y}, грань ${centre + 0.5}`,
  )
})

test('коллайдер снимается из всех корзин, в которые попал', () => {
  const world = createCollisionWorld(8)
  // Высокий коллайдер заведомо пересекает несколько корзин по 8 метров.
  const tall = makeCollider(0, 20, 0, 2, 40, 2, 'solid')
  world.add(tall)
  assert.ok(world.query(-2, 0, -2, 2, 40, 2).length > 0)

  world.remove(tall)
  assert.equal(world.query(-2, 0, -2, 2, 40, 2).length, 0, 'после снятия коллайдера запрос должен быть пуст')
  assert.equal(world.count, 0)
})

test('removeByOwner убирает все коллайдеры платформы', () => {
  const world = createCollisionWorld()
  const owner = {}
  world.add(makeCollider(0, 0, 0, 4, 1, 4, 'solid', owner))
  world.add(makeCollider(0, 2, 0, 1, 1, 1, 'hazard', owner))
  world.add(makeCollider(20, 0, 0, 4, 1, 4, 'solid', {}))

  world.removeByOwner(owner)
  assert.equal(world.count, 1, 'должен остаться только чужой коллайдер')
})

test('запрос не возвращает один коллайдер дважды', () => {
  const world = createCollisionWorld(4)
  world.add(makeCollider(0, 10, 0, 2, 20, 2, 'solid'))
  const found = world.query(-2, 0, -2, 2, 20, 2)
  assert.equal(found.length, 1, 'коллайдер из нескольких корзин должен встретиться один раз')
})

test('raycastDown находит ближайшую опору под точкой', () => {
  const world = createCollisionWorld()
  world.add(makeCollider(0, -0.5, 0, 10, 1, 10, 'solid'))
  world.add(makeCollider(0, -10, 0, 10, 1, 10, 'solid'))

  const hit = world.raycastDown(0, 0, 5, 30)
  assert.ok(hit, 'опора должна найтись')
  assert.equal(hit.y, 0, 'должна вернуться верхняя грань ближайшей платформы')

  assert.equal(world.raycastDown(50, 50, 5, 30), null, 'в пустоте опоры быть не должно')
})

test('moveCollider переносит границы вслед за центром', () => {
  const collider = makeCollider(0, 0, 0, 2, 2, 2, 'solid')
  moveCollider(collider, 5, 10, -3)
  assert.equal(collider.minX, 4)
  assert.equal(collider.maxX, 6)
  assert.equal(collider.minY, 9)
  assert.equal(collider.maxZ, -2)
})
