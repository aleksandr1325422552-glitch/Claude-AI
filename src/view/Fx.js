import * as THREE from 'three'
import { geo } from './models/common.js'
import { clamp } from '../core/util.js'

const PARTICLES = 140
const RINGS = 10
const projected = new THREE.Vector3()

/**
 * Эффекты: искры, расходящиеся круги и всплывающие надписи.
 * Частицы и круги — пул объектов, надписи — обычные DOM-элементы
 * (так текст остаётся резким и не требует шрифтовых текстур).
 */
export class Fx {
  constructor(scene, camera, canvas, layer) {
    this.camera = camera
    this.canvas = canvas
    this.layer = layer

    this.particles = []
    const pMat = () => new THREE.MeshBasicMaterial({ transparent: true })
    for (let i = 0; i < PARTICLES; i++) {
      const m = new THREE.Mesh(geo.icosa(0.09, 0), pMat())
      m.visible = false
      m.frustumCulled = false
      scene.add(m)
      this.particles.push({ mesh: m, life: 0, total: 1, vx: 0, vy: 0, vz: 0, spin: 0, gravity: -7 })
    }

    this.rings = []
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(
        geo.ring(0.4, 0.52, 28),
        new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      )
      m.rotation.x = -Math.PI / 2
      m.visible = false
      scene.add(m)
      this.rings.push({ mesh: m, life: 0, total: 1, from: 0.4, to: 2 })
    }

    this.texts = []
    this.pi = 0
    this.ri = 0
  }

  #nextParticle() {
    for (let i = 0; i < PARTICLES; i++) {
      const p = this.particles[(this.pi + i) % PARTICLES]
      if (p.life <= 0) {
        this.pi = (this.pi + i + 1) % PARTICLES
        return p
      }
    }
    return this.particles[(this.pi = (this.pi + 1) % PARTICLES)]
  }

  /** Разлетающиеся искры. */
  burst(x, z, { color = 0xffffff, count = 10, speed = 3, y = 0.6, size = 1, life = 0.7, gravity = -7 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.#nextParticle()
      const a = Math.random() * Math.PI * 2
      const up = 0.4 + Math.random() * 1.1
      p.mesh.position.set(x, y, z)
      p.mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8))
      p.mesh.material.color.setHex(color)
      p.mesh.material.opacity = 1
      p.mesh.visible = true
      p.vx = Math.cos(a) * speed * (0.4 + Math.random() * 0.8)
      p.vz = Math.sin(a) * speed * (0.4 + Math.random() * 0.8)
      p.vy = speed * up
      p.spin = (Math.random() - 0.5) * 12
      p.gravity = gravity
      p.total = p.life = life * (0.7 + Math.random() * 0.6)
    }
  }

  /** Круг, расходящийся по земле. */
  ring(x, z, { color = 0xffffff, from = 0.3, to = 2.2, life = 0.55, y = 0.06 } = {}) {
    const r = this.rings[(this.ri = (this.ri + 1) % RINGS)]
    r.mesh.position.set(x, y, z)
    r.mesh.material.color.setHex(color)
    r.mesh.material.opacity = 0.85
    r.mesh.visible = true
    r.from = from
    r.to = to
    r.total = r.life = life
  }

  /** Всплывающая надпись над точкой мира. */
  text(x, y, z, label, className = '') {
    const el = document.createElement('div')
    el.className = `fxtext ${className}`
    el.textContent = label
    this.layer.appendChild(el)
    this.texts.push({ el, x, y, z, life: 1.25, total: 1.25 })
  }

  update(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) {
        p.mesh.visible = false
        continue
      }
      p.vy += p.gravity * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.y += p.vy * dt
      p.mesh.position.z += p.vz * dt
      if (p.mesh.position.y < 0.06) {
        p.mesh.position.y = 0.06
        p.vy *= -0.35
        p.vx *= 0.6
        p.vz *= 0.6
      }
      p.mesh.rotation.x += p.spin * dt
      p.mesh.rotation.y += p.spin * dt * 0.7
      p.mesh.material.opacity = clamp(p.life / p.total, 0, 1)
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue
      r.life -= dt
      if (r.life <= 0) {
        r.mesh.visible = false
        continue
      }
      const t = 1 - r.life / r.total
      const s = r.from + (r.to - r.from) * t
      r.mesh.scale.setScalar(s)
      r.mesh.material.opacity = 0.85 * (1 - t)
    }

    this.#updateTexts(dt)
  }

  #updateTexts(dt) {
    if (!this.texts.length) return
    const rect = this.canvas.getBoundingClientRect()
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      t.life -= dt
      if (t.life <= 0) {
        t.el.remove()
        this.texts.splice(i, 1)
        continue
      }
      const k = 1 - t.life / t.total
      projected.set(t.x, t.y + k * 1.5, t.z).project(this.camera)
      const sx = rect.left + ((projected.x + 1) / 2) * rect.width
      const sy = rect.top + ((1 - projected.y) / 2) * rect.height
      t.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${(1 + k * 0.15).toFixed(3)})`
      t.el.style.opacity = String(clamp(t.life / t.total < 0.35 ? (t.life / t.total) / 0.35 : 1, 0, 1))
    }
  }

  clearTexts() {
    for (const t of this.texts) t.el.remove()
    this.texts.length = 0
  }
}
