"use client"

import { useEffect, useRef } from "react"
import { type AtlasState, STATE_PROFILE, type StateProfile } from "./atlas-state"

interface Lobe {
  x: number
  y: number
  r: number
  phase: number
  // independent slow shape-shift (breathe) speed + amount
  bSpeed: number
  bAmt: number
  // independent slow positional drift speed
  dSpeed: number
}

// Normalized cloud silhouette — flat-ish bottom, soft rolling bumps on top.
// Each lobe breathes and drifts on its own phase so the cloud shape is
// asymmetric and continuously, organically changing.
const LOBES: Lobe[] = [
  { x: -0.62, y: 0.2, r: 0.4, phase: 0.2, bSpeed: 0.31, bAmt: 0.1, dSpeed: 0.23 },
  { x: -0.28, y: -0.04, r: 0.54, phase: 1.1, bSpeed: 0.24, bAmt: 0.13, dSpeed: 0.19 },
  { x: 0.1, y: -0.16, r: 0.6, phase: 2.4, bSpeed: 0.19, bAmt: 0.11, dSpeed: 0.27 },
  { x: 0.5, y: 0.0, r: 0.5, phase: 3.3, bSpeed: 0.28, bAmt: 0.12, dSpeed: 0.21 },
  { x: 0.82, y: 0.24, r: 0.34, phase: 4.1, bSpeed: 0.35, bAmt: 0.1, dSpeed: 0.3 },
  { x: -0.86, y: 0.32, r: 0.3, phase: 5.0, bSpeed: 0.26, bAmt: 0.12, dSpeed: 0.17 },
  { x: 0.0, y: 0.26, r: 0.52, phase: 0.7, bSpeed: 0.22, bAmt: 0.09, dSpeed: 0.25 },
  { x: -0.42, y: 0.32, r: 0.38, phase: 2.0, bSpeed: 0.33, bAmt: 0.11, dSpeed: 0.2 },
  { x: 0.42, y: 0.32, r: 0.4, phase: 3.7, bSpeed: 0.29, bAmt: 0.12, dSpeed: 0.24 },
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  maxLife: number
  gold: boolean
}

const GOLD = [253, 240, 205] as const

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function AtlasCloud({ state }: { state: AtlasState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<AtlasState>(state)
  // profile that eases toward the target state for smooth transitions
  const currentRef = useRef<StateProfile>({
    ...STATE_PROFILE.idle,
    tint: [...STATE_PROFILE.idle.tint],
  })

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    const particles: Particle[] = []
    let raf = 0
    const start = performance.now()
    // smoothed speaking envelope (0..1) — heavily damped so speech never jitters
    let speechEnv = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    const spawnParticle = (
      cx: number,
      cy: number,
      R: number,
      goldChance: number,
    ): Particle => {
      const angle = Math.random() * Math.PI * 2
      const dist = R * (0.4 + Math.random() * 0.8)
      const maxLife = 3000 + Math.random() * 3500
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist * 0.7,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.06 - Math.random() * 0.16,
        size: 0.7 + Math.random() * 1.6,
        life: 0,
        maxLife,
        gold: Math.random() < goldChance,
      }
    }

    const render = (now: number) => {
      const elapsed = (now - start) / 1000
      const cur = currentRef.current
      const target = STATE_PROFILE[stateRef.current]

      // ease every profile value toward the target — this is what makes
      // state changes (e.g. speaking -> idle) settle smoothly instead of snapping
      const e = 0.035
      cur.speed = lerp(cur.speed, target.speed, e)
      cur.drift = lerp(cur.drift, target.drift, e)
      cur.breath = lerp(cur.breath, target.breath, e)
      cur.speech = lerp(cur.speech, target.speech, e)
      cur.wisp = lerp(cur.wisp, target.wisp, e)
      cur.particles = lerp(cur.particles, target.particles, e)
      cur.glow = lerp(cur.glow, target.glow, e)
      cur.rays = lerp(cur.rays, target.rays, e)
      cur.tint[0] = lerp(cur.tint[0], target.tint[0], e)
      cur.tint[1] = lerp(cur.tint[1], target.tint[1], e)
      cur.tint[2] = lerp(cur.tint[2], target.tint[2], e)

      const [tr, tg, tb] = cur.tint.map(Math.round) as [number, number, number]

      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2
      const baseR = Math.min(width, height) * 0.32
      const t = prefersReduced ? 0 : elapsed * cur.speed

      // --- speaking envelope: a gentle, speech-like open/close cadence ---
      // built from layered slow sines (phrase + syllable) then heavily smoothed,
      // so the cloud "breathes" as if speaking rather than shaking.
      const isSpeaking = stateRef.current === "speaking"
      const speechAmt = isSpeaking ? 1 : stateRef.current === "working" ? 0.3 : 0
      const speechWave =
        (0.55 + 0.45 * Math.sin(elapsed * 2.3)) *
        (0.55 + 0.45 * Math.sin(elapsed * 1.05 + 0.6)) *
        (0.6 + 0.4 * Math.sin(elapsed * 4.1 + 1.4))
      const speechTarget = prefersReduced ? 0 : speechAmt * cur.speech * speechWave
      speechEnv = lerp(speechEnv, speechTarget, 0.07)

      // slow whole-cloud breathing + speaking stretch (taller/narrower on "open")
      const breathe = 1 + Math.sin(t * 0.5) * cur.breath
      const stretch = speechEnv * 0.085
      const R = baseR * breathe
      const Ry = R * (1 + stretch)
      const Rx = R * (1 - stretch * 0.35)

      // helper: current animated position + radius of a lobe
      const lobeGeom = (lobe: Lobe) => {
        const b =
          1 + Math.sin(t * lobe.bSpeed * 1.8 + lobe.phase) * lobe.bAmt * cur.drift
        const dx =
          Math.sin(t * lobe.dSpeed * 1.8 + lobe.phase) * R * 0.02 * cur.drift
        const dy =
          Math.cos(t * lobe.dSpeed * 1.8 * 0.8 + lobe.phase * 1.3) *
          R *
          0.015 *
          cur.drift
        return {
          lx: cx + lobe.x * Rx + dx,
          ly: cy + lobe.y * Ry + dy,
          lr: lobe.r * R * b,
        }
      }

      // ============ 1. gentle centered atmospheric warmth (behind Atlas) ======
      // a very soft, even gold wash so the whole area around Atlas feels sunlit —
      // not a spotlight on her top. The silhouette-following halo (section 3)
      // does the real edge illumination.
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      const glowR = R * 2.0
      const backlight = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, glowR)
      const gA = 0.28 * cur.glow
      backlight.addColorStop(0, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${gA})`)
      backlight.addColorStop(
        0.5,
        `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${gA * 0.35})`,
      )
      backlight.addColorStop(1, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0)`)
      ctx.fillStyle = backlight
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // ============ 2. soft sun rays spreading from behind ============
      if (cur.rays > 0.01) {
        ctx.translate(cx, cy - R * 0.1)
        ctx.rotate(t * 0.025)
        const rayCount = 10
        const len = R * 2.6
        for (let i = 0; i < rayCount; i++) {
          const a = (i / rayCount) * Math.PI * 2
          const inten =
            0.05 * cur.rays * (0.55 + 0.45 * Math.sin(elapsed * 0.5 + i * 1.7))
          ctx.save()
          ctx.rotate(a)
          const rg = ctx.createLinearGradient(0, 0, len, 0)
          rg.addColorStop(0, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0)`)
          rg.addColorStop(0.35, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${inten})`)
          rg.addColorStop(1, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0)`)
          ctx.fillStyle = rg
          const w = R * 0.16
          ctx.beginPath()
          ctx.moveTo(0, -w * 0.25)
          ctx.lineTo(len, -w)
          ctx.lineTo(len, w)
          ctx.lineTo(0, w * 0.25)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }
      }
      ctx.restore()

      // ============ 3. sunlit gold halo hugging the whole silhouette =========
      // one gold glow per lobe, larger than the lobe and drawn BEHIND the cloud
      // body, so warm light spills out around the entire irregular edge —
      // top, sides and bottom. Upper/sun-facing lobes glow a little stronger.
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (const lobe of LOBES) {
        const { lx, ly, lr } = lobeGeom(lobe)
        // upper lobes (smaller/negative y) get a mild boost; lower still lit
        const bias = 1 - lobe.y * 0.55
        const hr = lr * 1.5
        const a = 0.2 * cur.glow * bias
        const g = ctx.createRadialGradient(lx, ly, lr * 0.4, lx, ly, hr)
        g.addColorStop(0, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${a})`)
        g.addColorStop(0.6, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${a * 0.4})`)
        g.addColorStop(1, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(lx, ly, hr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // ============ 4. cloud body: layered translucent masses for depth ==========
      // pass A: cool pale-blue outer mass (atmosphere)
      // pass B: soft white cloud masses
      // pass C: bright warm-white core (sunlit heart)
      const passes = [
        {
          color: [tr, tg, tb] as readonly [number, number, number],
          scale: 1.16,
          alpha: 0.34,
          offY: R * 0.05,
          mid: 0.55,
        },
        {
          color: [255, 255, 255] as readonly [number, number, number],
          scale: 1.0,
          alpha: 0.92,
          offY: 0,
          mid: 0.7,
        },
        {
          color: [255, 252, 244] as readonly [number, number, number],
          scale: 0.6,
          alpha: 0.55,
          offY: -R * 0.14,
          mid: 0.62,
        },
      ]

      for (const pass of passes) {
        for (const lobe of LOBES) {
          const { lx, ly, lr } = lobeGeom(lobe)
          const r = lr * pass.scale
          const py = ly + pass.offY
          const g = ctx.createRadialGradient(lx, py, 0, lx, py, r)
          const [cr, cg, cb] = pass.color
          g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${pass.alpha})`)
          g.addColorStop(pass.mid, `rgba(${cr}, ${cg}, ${cb}, ${pass.alpha * 0.5})`)
          g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(lx, py, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ============ 5. internal flowing wisps / filaments ============
      if (cur.wisp > 0.02) {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        const strands = 4
        for (let s = 0; s < strands; s++) {
          const yBase = cy + (s - 1.5) * R * 0.24
          const amp = R * 0.05 * (0.6 + cur.wisp)
          const phase = t * (0.4 + cur.wisp * 0.5) + s * 1.7
          ctx.beginPath()
          for (let px = -R * 0.9; px <= R * 0.9; px += 6) {
            const py =
              yBase +
              Math.sin(px * 0.018 + phase) * amp +
              Math.sin(px * 0.045 - phase * 0.7) * amp * 0.4
            if (px === -R * 0.9) ctx.moveTo(cx + px, py)
            else ctx.lineTo(cx + px, py)
          }
          const wa = 0.06 * cur.wisp
          ctx.strokeStyle = `rgba(255, 255, 255, ${wa})`
          ctx.lineWidth = R * 0.06
          ctx.stroke()
        }
        ctx.restore()
      }

      // ============ 6. subtle sunlit rim kissing the cloud edges ============
      // a soft warm highlight on the lobe edges, biased slightly toward the
      // upper/sun-facing side but present around the whole silhouette.
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (const lobe of LOBES) {
        const { lx, ly, lr } = lobeGeom(lobe)
        const bias = lobe.y < 0.1 ? 1 : 0.55
        const ry = ly - lr * 0.3
        const rr = lr * 0.72
        const g = ctx.createRadialGradient(lx, ry, 0, lx, ry, rr)
        const a = 0.18 * cur.glow * bias
        g.addColorStop(0, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${a})`)
        g.addColorStop(0.7, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, ${a * 0.35})`)
        g.addColorStop(1, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(lx, ry, rr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // ============ 7. thinking/working: light traveling through the cloud =====
      if (stateRef.current === "thinking" || stateRef.current === "working") {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        for (let i = 0; i < 3; i++) {
          const a = t * (0.6 + i * 0.25) + (i * Math.PI * 2) / 3
          const ox = cx + Math.cos(a) * R * 0.55
          const oy = cy + Math.sin(a * 1.2) * R * 0.4
          const rr = R * 0.4
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr)
          g.addColorStop(0, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0.12)`)
          g.addColorStop(1, `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(ox, oy, rr, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      // ============ 8. drifting atmospheric particles ============
      const dt = 16
      const goldChance = 0.25 * cur.glow
      const targetCount = Math.floor(cur.particles * 40)
      while (particles.length < targetCount) {
        particles.push(spawnParticle(cx, cy, R, goldChance))
      }
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life += dt
        if (!prefersReduced) {
          p.x += p.vx * dt
          p.y += p.vy * dt
        }
        const lifeT = p.life / p.maxLife
        if (lifeT >= 1 || particles.length > targetCount + 4) {
          particles.splice(i, 1)
          continue
        }
        const fade = Math.sin(lifeT * Math.PI)
        const col = p.gold ? GOLD : ([255, 255, 255] as const)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${0.45 * fade})`
        ctx.fill()
      }
      ctx.restore()

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        role="img"
        aria-label={`Atlas is ${state}`}
      />
    </div>
  )
}
