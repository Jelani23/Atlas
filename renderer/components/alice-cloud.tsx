"use client"

import { useEffect, useRef } from "react"
import { type AtlasState, STATE_PROFILE, type StateProfile } from "./atlas-state"
import { speechLevel } from "@/lib/audio-level"
import { EMOTION_PROFILE, emotionState, updateEmotion } from "@/lib/emotion"
import { useAudioViseme } from "@/hooks/useAudioViseme"
import { NEUTRAL_SHAPE } from "@/lib/visemes"

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
// Each lobe has its own phase for texture, but positional movement is now
// dominated by a single shared "body" motion (see bodySwayX/Y in render())
// so the pieces read as one rigged character rather than independent
// particles — each lobe's own phase only adds a capped amount of secondary
// motion on top.
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

type ParticleKind = "ambient" | "steam" | "rain"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  maxLife: number
  gold: boolean
  kind: ParticleKind
}

const GOLD = [253, 240, 205] as const
const STEAM = [225, 220, 222] as const
const RAIN = [162, 198, 232] as const

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function AliceCloud({ state }: { state: AtlasState }) {
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

  // Live viseme shape (openness/width/roundness) driven by phoneme
  // timestamps when available, plus the amplitude signal already used
  // below for `liveLevel`. See lib/visemes.ts and lib/audio-level.ts for
  // how these are produced, and hooks/useAudioViseme.ts for why this is a
  // ref-returning hook rather than React state (read every animation
  // frame inside the canvas loop below, not rendered as text).
  const { shape: visemeShapeRef } = useAudioViseme()

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

    // Transition "punch" — a tiny spring kicked whenever the activity state
    // changes (idle -> thinking -> speaking -> ...), giving every switch a
    // brief anticipation/overshoot/recoil bounce instead of a flat fade.
    let punchVal = 0
    let punchVel = 0
    let prevActivity = stateRef.current
    let lastPunchTick = start

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

    const spawnAmbient = (
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
        kind: "ambient",
      }
    }

    // Angry: little puffs of steam rising off the top of the cloud — a
    // cartoon "anger" cue rather than generic drifting particles.
    const spawnSteam = (cx: number, topY: number, R: number): Particle => {
      const spread = R * 0.55
      return {
        x: cx + (Math.random() - 0.5) * 2 * spread,
        y: topY - Math.random() * R * 0.1,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.22 - Math.random() * 0.22,
        size: 1.6 + Math.random() * 2.2,
        life: 0,
        maxLife: 650 + Math.random() * 500,
        gold: false,
        kind: "steam",
      }
    }

    // Sad: droplets falling from underneath the cloud. Count/frequency
    // scale with sadness intensity elsewhere (mild drizzle vs. storm).
    const spawnRain = (cx: number, bottomY: number, R: number): Particle => {
      const spread = R * 0.5
      return {
        x: cx + (Math.random() - 0.5) * 2 * spread,
        y: bottomY,
        vx: 0,
        vy: 0.4 + Math.random() * 0.35,
        size: 1.2 + Math.random() * 1.4,
        life: 0,
        maxLife: 900 + Math.random() * 500,
        gold: false,
        kind: "rain",
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
      cur.wobble = lerp(cur.wobble, target.wobble, e)
      cur.tint[0] = lerp(cur.tint[0], target.tint[0], e)
      cur.tint[1] = lerp(cur.tint[1], target.tint[1], e)
      cur.tint[2] = lerp(cur.tint[2], target.tint[2], e)

      // kick the transition-punch spring whenever activity changes
      if (stateRef.current !== prevActivity) {
        punchVel -= 0.9
        prevActivity = stateRef.current
      }
      const punchDt = Math.min(0.05, Math.max(0, (now - lastPunchTick) / 1000)) || 1 / 60
      lastPunchTick = now
      const punchAccel = (0 - punchVal) * 70 - punchVel * 13
      punchVel += punchAccel * punchDt
      punchVal += punchVel * punchDt

      // --- emotion layer: continuous overlay on top of the activity profile
      // above, driven by a spring (see lib/emotion.ts) so it naturally
      // anticipates, overshoots and recoils instead of just fading in/out.
      // `emoRaw` can briefly swing a little past 0/1 during that bounce —
      // used for shape/motion, where the overshoot reads as character.
      // `emoT` is the same value clamped to 0..1 — used for color and
      // particle counts, which don't look right overshooting.
      const emoRaw = prefersReduced ? 0 : updateEmotion(now)
      const emoT = clamp(emoRaw, 0, 1)
      const emo = EMOTION_PROFILE[emotionState.type]
      const speedMult = lerp(1, emo.speedMult, emoRaw)
      const driftMult = lerp(1, emo.driftMult, emoRaw)
      const breathMult = lerp(1, emo.breathMult, emoRaw)
      const wobbleMult = lerp(1, emo.wobbleMult, emoRaw)
      const glowMult = Math.max(0, lerp(1, emo.glowMult, emoT))
      const particleMult = Math.max(0, lerp(1, emo.particleMult, emoT))
      const wispMult = Math.max(0, lerp(1, emo.wispMult, emoT))

      const [baseTr, baseTg, baseTb] = cur.tint.map(Math.round) as [number, number, number]
      // blend toward the emotion's tint on top of whatever activity tint
      // already landed on — neutral's tint is a no-op so this stays inert
      // until an emotion is actually active
      const tintW = emotionState.type === "neutral" ? 0 : emoT * 0.75
      const tr = Math.round(lerp(baseTr, emo.tint[0], tintW))
      const tg = Math.round(lerp(baseTg, emo.tint[1], tintW))
      const tb = Math.round(lerp(baseTb, emo.tint[2], tintW))

      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      let cy = height / 2
      const baseR = Math.min(width, height) * 0.32
      const t = prefersReduced ? 0 : elapsed * cur.speed * speedMult

      // --- speaking envelope: follows Alice's actual voice ---
      // `speechLevel.current` is live TTS amplitude (see lib/audio-level.ts),
      // sampled from whatever audio chunk is currently playing. A soft
      // simulated cadence fills in for the brief moments speaking is "on"
      // but audio hasn't started yet (or between chunks), so the cloud
      // never freezes mid-reply.
      const isSpeaking = stateRef.current === "speaking"
      const speechAmt = isSpeaking ? 1 : stateRef.current === "working" ? 0.22 : 0
      const liveLevel = prefersReduced ? 0 : speechLevel.current
      const simulatedWave =
        0.5 + 0.5 * Math.sin(elapsed * 1.6) * Math.sin(elapsed * 0.8 + 0.6)
      const speechWave = isSpeaking
        ? Math.max(liveLevel, simulatedWave * 0.3)
        : simulatedWave
      const speechTarget = prefersReduced ? 0 : speechAmt * cur.speech * speechWave
      const followingAudio = isSpeaking && liveLevel > 0.02
      const easeRate = followingAudio ? 0.35 : speechTarget > speechEnv ? 0.16 : 0.06
      speechEnv = lerp(speechEnv, speechTarget, easeRate)

      // --- hybrid lip-sync: viseme SHAPE x live AMPLITUDE ---
      // `visemeShapeRef.current` is which sound Alice is "making" right now
      // (openness/width/roundness, from phoneme timestamps — see
      // lib/visemes.ts); `liveLevel` is how loud she's making it right now
      // (Web Audio analyser amplitude, same signal driving speechEnv above).
      // Shape picks the direction of the bias, amplitude scales how much of
      // it shows — a quiet "aa" barely moves, a loud one opens up.
      // NEUTRAL_SHAPE (the fallback when no phoneme timestamps exist for
      // the current chunk — true for every TTS provider wired up today)
      // sits exactly at these bias midpoints, so all three biases resolve
      // to 0 and this whole block is a no-op until phoneme data shows up.
      const vShape = visemeShapeRef.current
      const visemeStrength = followingAudio ? liveLevel : 0
      const openBias = (vShape.openness - NEUTRAL_SHAPE.openness) * visemeStrength * 0.5
      const widthBias = (vShape.width - NEUTRAL_SHAPE.width) * visemeStrength * 0.35
      const roundBias = (vShape.roundness - NEUTRAL_SHAPE.roundness) * visemeStrength * 0.22

      // whole-cloud breathing — fast/big enough to read as an actively
      // "alive" character rather than a slow ambient drift.
      const breathe = 1 + Math.sin(t * 1.8) * cur.breath * breathMult * 1.6
      // speech stretch + the emotion's own squash/stretch + the transition
      // punch bounce, all layered additively so none of them fight.
      // Speech is deliberately the biggest single contributor here — this
      // is what makes Alice's body pulse with her actual voice rather than
      // just doing one bounce when speaking starts and coasting after.
      const stretch = speechEnv * 1 + emo.squash * emoRaw + punchVal * 0.11 + openBias
      // a quick secondary pulse layered on top, phase-locked to speechEnv
      // rather than a fixed clock, so it only ever moves when there's
      // actually something to react to. Rounder visemes (o/u) get a touch
      // more pulse — reads as the pursed-lip "pop" those sounds have.
      const talkPulse = isSpeaking
        ? Math.sin(elapsed * 13) * speechEnv * speechEnv * (0.05 + roundBias * 0.3)
        : 0

      // --- jello wobble: squash/stretch that keeps Alice bouncing and
      // jiggling like a physical, springy character even at rest. Recedes
      // while she's actively talking so the audio-driven speech motion
      // reads clearly instead of fighting the resting jiggle.
      const wobblePhase = elapsed * 0.6
      const wobbleQuiet = isSpeaking ? lerp(1, 0.45, Math.min(1, speechEnv * 2)) : 1
      const wobbleY = Math.sin(wobblePhase) * 0.16 * cur.wobble * wobbleMult * wobbleQuiet
      const wobbleX =
        Math.sin(wobblePhase * 0.7 + 1.4) * 0.19 * cur.wobble * wobbleMult * wobbleQuiet

      const R = baseR * breathe * (1 + talkPulse)
      const Ry = R * (1 + stretch + wobbleY)
      // width bias widens/narrows independent of the openness-driven
      // squash above; roundness pulls the opposite way (rounded visemes
      // like "O"/"U" read as narrower + taller, not wider)
      const Rx = R * (1 - stretch * 0.35 + wobbleX + widthBias - roundBias * 0.4)
      // sinks Alice's center of mass for sad/angry-hunch, lifts it for
      // happy/surprise — applied once here so the halo, rays and body all
      // move together instead of drifting apart
      cy += emo.droop * emoRaw * R * 0.3 + punchVal * R * 0.04

      // === shared "body rig" motion ============================================
      // This is the fix for lobes drifting apart into holes/gaps or
      // collapsing into a uniform circle: almost all POSITIONAL movement
      // now flows through one shared oscillator that every lobe follows
      // together (bodySwayX/Y), plus the transition punch. Each lobe's own
      // phase only contributes a small, hard-capped amount of individual
      // "secondary motion" texture on top — enough to keep the organic
      // cloud-like feel without ever letting a piece wander off as its own
      // independent particle.
      const drift = cur.drift * driftMult
      const bodyPhase = t * 1.3
      const bodySwayX = Math.sin(bodyPhase * 0.55) * R * 0.09 * drift
      const bodySwayY = Math.cos(bodyPhase * 0.45 + 0.8) * R * 0.05 * drift

      const lobeGeom = (lobe: Lobe) => {
        // per-lobe breathing (size), clamped so no single lobe balloons or
        // collapses enough to tear a hole in the silhouette
        const bRaw = Math.sin(t * lobe.bSpeed * 2.6 + lobe.phase) * lobe.bAmt * drift * 1.5
        const b = 1 + clamp(bRaw, -0.35, 0.35)

        // confused: left/right lobes fall slightly out of sync with each
        // other; also doubles as a vertical shear (tiltDx) so the upper
        // cloud leans one way and the lower cloud the other — reads as a
        // head-tilt even without a literal head.
        const side = lobe.x < 0 ? -1 : 1
        const tiltDx = -lobe.y * R * emo.asymmetry * emoRaw * 0.45
        const asymDx =
          side * emo.asymmetry * emoRaw * R * 0.05 * Math.sin(t * 1.4 + lobe.phase)

        // small individual secondary motion, on top of the shared body sway
        const indivDx =
          Math.sin(t * lobe.dSpeed * 2.2 + lobe.phase) * R * 0.022 * drift
        const indivDy =
          Math.cos(t * lobe.dSpeed * 2.2 * 0.8 + lobe.phase * 1.3) * R * 0.018 * drift

        // a ripple that flows lobe-to-lobe while Alice speaks, directly
        // tied to the live speech envelope — this is the main thing that
        // should visibly pulse in sync with her actual voice
        const ripple = 1 + Math.sin(elapsed * 5.5 + lobe.phase * 1.6) * speechEnv * 0.16

        // soft cap on total positional offset — guarantees cohesion no
        // matter how extreme the multipliers get during a strong emotion
        const capR = R * 0.24
        let dx = bodySwayX + indivDx + tiltDx + asymDx
        let dy = bodySwayY + indivDy
        dx = Math.tanh(dx / capR) * capR
        dy = Math.tanh(dy / capR) * capR

        return {
          lx: cx + lobe.x * Rx + dx,
          ly: cy + lobe.y * Ry + dy,
          lr: lobe.r * R * b * ripple,
        }
      }

      // ============ 1. gentle centered atmospheric warmth (behind Alice) ======
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      const glowR = R * 2.0
      const backlight = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, glowR)
      const effGlow = Math.max(0, cur.glow * glowMult)
      const effWisp = Math.max(0, cur.wisp * wispMult)
      const effParticles = Math.max(0, cur.particles * particleMult)
      const gA = 0.28 * effGlow
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
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (const lobe of LOBES) {
        const { lx, ly, lr } = lobeGeom(lobe)
        const bias = 1 - lobe.y * 0.55
        const hr = lr * 1.5
        const a = 0.2 * effGlow * bias
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

      // ============ 3b. confused: small orbiting element ============
      // A little satellite puff circling the upper cloud, like a stray
      // thought orbiting Alice's head — only visible while confused.
      if (emotionState.type === "confused" && emoT > 0.05) {
        const orbitAngle = elapsed * 2.6
        const orbitR = R * 0.62
        const ox = cx + Math.cos(orbitAngle) * orbitR * 0.85
        const oy = cy - R * 0.55 + Math.sin(orbitAngle) * orbitR * 0.4
        const or_ = R * 0.13 * (0.6 + emoT * 0.4)
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, or_ * 1.8)
        og.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, ${0.5 * emoT})`)
        og.addColorStop(0.6, `rgba(255, 255, 255, ${0.3 * emoT})`)
        og.addColorStop(1, `rgba(255, 255, 255, 0)`)
        ctx.fillStyle = og
        ctx.beginPath()
        ctx.arc(ox, oy, or_ * 1.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * emoT})`
        ctx.beginPath()
        ctx.arc(ox, oy, or_, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // ============ 4. cloud body: layered translucent masses for depth ==========
      // pass A: cool outer mass (atmosphere) — carries the full tint, and
      // grows stronger while an emotion is active.
      // pass B/C: white cloud masses — stay mostly white/warm so Alice
      // reads as an actual cloud, but bleed emotion tint through at high
      // intensity so a strong feeling shows on the body, not just the edges.
      const bodyTintW = emotionState.type === "neutral" ? 0 : emoT * 0.3
      const passes = [
        {
          color: [tr, tg, tb] as readonly [number, number, number],
          scale: 1.16,
          alpha: 0.34 * (1 + emoT * 0.9),
          offY: R * 0.05,
          mid: 0.55,
        },
        {
          color: [
            Math.round(lerp(255, tr, bodyTintW)),
            Math.round(lerp(255, tg, bodyTintW)),
            Math.round(lerp(255, tb, bodyTintW)),
          ] as readonly [number, number, number],
          scale: 1.0,
          alpha: 0.92,
          offY: 0,
          mid: 0.7,
        },
        {
          color: [
            Math.round(lerp(255, tr, bodyTintW * 0.7)),
            Math.round(lerp(252, tg, bodyTintW * 0.7)),
            Math.round(lerp(244, tb, bodyTintW * 0.7)),
          ] as readonly [number, number, number],
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
      if (effWisp > 0.02) {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        const strands = 4
        for (let s = 0; s < strands; s++) {
          const yBase = cy + (s - 1.5) * R * 0.24
          const amp = R * 0.05 * (0.6 + effWisp)
          const phase = t * (0.4 + effWisp * 0.5) + s * 1.7
          ctx.beginPath()
          for (let px = -R * 0.9; px <= R * 0.9; px += 6) {
            const py =
              yBase +
              Math.sin(px * 0.018 + phase) * amp +
              Math.sin(px * 0.045 - phase * 0.7) * amp * 0.4
            if (px === -R * 0.9) ctx.moveTo(cx + px, py)
            else ctx.lineTo(cx + px, py)
          }
          const wa = 0.06 * effWisp
          ctx.strokeStyle = `rgba(255, 255, 255, ${wa})`
          ctx.lineWidth = R * 0.06
          ctx.stroke()
        }
        ctx.restore()
      }

      // ============ 6. subtle sunlit rim kissing the cloud edges ============
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (const lobe of LOBES) {
        const { lx, ly, lr } = lobeGeom(lobe)
        const bias = lobe.y < 0.1 ? 1 : 0.55
        const ry = ly - lr * 0.3
        const rr = lr * 0.72
        const g = ctx.createRadialGradient(lx, ry, 0, lx, ry, rr)
        const a = 0.18 * effGlow * bias
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

      // ============ 8. particles: ambient drift + emotion-specific fx ============
      const dt = 16
      const goldChance = 0.25 * effGlow
      const ambientTarget = Math.floor(effParticles * 40)
      const isAngry = emotionState.type === "angry"
      const isSad = emotionState.type === "sad"
      const steamTarget = isAngry ? Math.floor(emoT * 14) : 0
      const rainTarget = isSad ? Math.floor(emoT * 30) : 0

      let ambientCount = 0
      let steamCount = 0
      let rainCount = 0
      for (const p of particles) {
        if (p.kind === "ambient") ambientCount++
        else if (p.kind === "steam") steamCount++
        else rainCount++
      }

      while (ambientCount < ambientTarget) {
        particles.push(spawnAmbient(cx, cy, R, goldChance))
        ambientCount++
      }
      if (steamCount < steamTarget) {
        // topmost point of the silhouette, roughly
        const topY = cy - R * 0.85
        particles.push(spawnSteam(cx, topY, R))
      }
      if (rainCount < rainTarget) {
        const bottomY = cy + R * 0.6
        particles.push(spawnRain(cx, bottomY, R))
      }

      ctx.save()
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life += dt
        if (!prefersReduced) {
          p.x += p.vx * dt
          p.y += p.vy * dt
          if (p.kind === "rain") p.vy += 0.0009 * dt // light gravity
        }
        const lifeT = p.life / p.maxLife
        const overCap =
          (p.kind === "ambient" && ambientCount > ambientTarget + 4) ||
          (p.kind === "steam" && steamCount > steamTarget + 6) ||
          (p.kind === "rain" && rainCount > rainTarget + 8)
        if (lifeT >= 1 || overCap) {
          particles.splice(i, 1)
          continue
        }

        if (p.kind === "rain") {
          const fade = Math.min(1, lifeT * 6) * (1 - lifeT)
          ctx.globalCompositeOperation = "source-over"
          ctx.strokeStyle = `rgba(${RAIN[0]}, ${RAIN[1]}, ${RAIN[2]}, ${0.6 * fade})`
          ctx.lineWidth = p.size
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x, p.y + p.size * 3.2)
          ctx.stroke()
        } else if (p.kind === "steam") {
          const fade = Math.sin(lifeT * Math.PI)
          const grow = 1 + lifeT * 1.8
          ctx.globalCompositeOperation = "lighter"
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * grow, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${STEAM[0]}, ${STEAM[1]}, ${STEAM[2]}, ${0.28 * fade})`
          ctx.fill()
        } else {
          const fade = Math.sin(lifeT * Math.PI)
          const col = p.gold ? GOLD : ([255, 255, 255] as const)
          ctx.globalCompositeOperation = "lighter"
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${0.45 * fade})`
          ctx.fill()
        }
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
        aria-label={`Alice is ${state}`}
      />
    </div>
  )
}