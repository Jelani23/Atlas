"use client"

// Emotion layer — a small continuous-value overlay that sits ALONGSIDE the
// activity state machine in atlas-state.ts, not inside it. Activity
// (idle/thinking/speaking/working/listening/error) drives Alice's base
// motion profile; emotion modifies that motion without replacing it, the
// same way a facial expression modifies a body's posture without changing
// what the body is doing.
//
// The intensity itself is driven by a small spring simulation rather than
// linear easing, so a reaction gets real cartoon physics for free:
// anticipation (a tiny dip before the main motion), overshoot (blowing
// past the target before settling), and recoil (a slight rebound past
// neutral on the way back down) — see updateEmotion() below.
//
// Kept as a single active emotion + intensity in a module-level object
// (same pattern as `speechLevel` in audio-level.ts) so any part of the app
// can call `setEmotion(...)` without prop drilling, and AliceCloud can
// read it every animation frame without triggering React re-renders.

export type EmotionType =
  | "neutral"
  | "happy"
  | "angry"
  | "surprised"
  | "sad"
  | "confused"

export interface EmotionProfile {
  // rgb Alice's tint blends toward as intensity rises (ignored for neutral)
  tint: [number, number, number]
  speedMult: number
  driftMult: number
  breathMult: number
  wobbleMult: number
  glowMult: number
  particleMult: number
  wispMult: number
  // + = taller/narrower (surprise lifting), - = shorter/wider (angry compression)
  squash: number
  // + sinks Alice's center of mass (sad, angry hunch), - lifts it (surprise/happy)
  droop: number
  // 0..1 — doubles as: left/right lobes falling out of sync (confused), AND
  // a vertical shear (upper vs lower lobes lean opposite ways) that reads
  // as a head-tilt. Both driven off the same asymmetry knob.
  asymmetry: number
}

// Illustrative starting values, tuned by feel against the existing cloud —
// not strict requirements. Easy to retune per-field later.
export const EMOTION_PROFILE: Record<EmotionType, EmotionProfile> = {
  neutral: {
    tint: [0, 0, 0],
    speedMult: 1, driftMult: 1, breathMult: 1, wobbleMult: 1,
    glowMult: 1, particleMult: 1, wispMult: 1,
    squash: 0, droop: 0, asymmetry: 0,
  },
  happy: {
    // warm golden-cream, more saturated than a pale yellow
    tint: [255, 205, 92],
    speedMult: 1.35, driftMult: 1.4, breathMult: 1.7, wobbleMult: 2.0,
    glowMult: 1.35, particleMult: 1.4, wispMult: 1.1,
    squash: -0.13, droop: -0.07, asymmetry: 0,
  },
  angry: {
    // deep, serious red — not pink
    tint: [176, 40, 34],
    speedMult: 2.2, driftMult: 2.0, breathMult: 0.7, wobbleMult: 2.6,
    glowMult: 0.85, particleMult: 0.6, wispMult: 1.6,
    squash: -0.3, droop: 0.06, asymmetry: 0,
  },
  surprised: {
    tint: [206, 176, 255],
    speedMult: 2.4, driftMult: 1.1, breathMult: 1.3, wobbleMult: 0.8,
    glowMult: 1.45, particleMult: 1.15, wispMult: 0.75,
    squash: 0.4, droop: -0.1, asymmetry: 0,
  },
  sad: {
    // deep cool blue, darkens further as intensity climbs (see tint blend
    // weight in alice-cloud.tsx) so mild drizzle vs. heavy storm read
    // as genuinely different weights of the same color, not a fixed hue
    tint: [58, 92, 148],
    speedMult: 0.45, driftMult: 0.5, breathMult: 0.6, wobbleMult: 0.4,
    glowMult: 0.5, particleMult: 0.45, wispMult: 0.55,
    squash: 0.1, droop: 0.28, asymmetry: 0,
  },
  confused: {
    tint: [190, 178, 220],
    speedMult: 1.2, driftMult: 1.4, breathMult: 1.15, wobbleMult: 1.3,
    glowMult: 1.0, particleMult: 0.9, wispMult: 1.25,
    squash: 0, droop: 0, asymmetry: 1.1,
  },
}

interface EmotionEngineState {
  type: EmotionType
  current: number // live spring position actually applied this frame — can
                   // briefly go slightly negative (recoil) or above 1
                   // (overshoot), both intentional
  velocity: number
  target: number // where the spring is pulling `current` toward
  stiffness: number
  damping: number
  holdUntil: number // performance.now() ms; target holds until this passes, then drops to 0
  lastTick: number // performance.now() ms of the last updateEmotion() call
}

export const emotionState: EmotionEngineState = {
  type: "neutral",
  current: 0,
  velocity: 0,
  target: 0,
  stiffness: 170,
  damping: 11,
  holdUntil: 0,
  lastTick: 0,
}

/**
 * Triggers an emotional impulse: a spring pulls intensity toward `intensity`
 * with a small anticipation dip first, overshoots slightly, settles, holds
 * for `holdMs`, then the same spring pulls it back to 0 (with its own
 * small recoil past zero) — callers don't need to clear it themselves.
 * Calling again mid-reaction retargets smoothly rather than snapping, so
 * back-to-back events blend instead of fighting.
 *
 * This is the impulse case from the design doc: whatever activity Alice is
 * in keeps running underneath — thinking, speaking, whatever — this only
 * ever touches the expression layered on top.
 */
export function setEmotion(
  type: EmotionType,
  intensity: number,
  opts?: { holdMs?: number; stiffness?: number; damping?: number },
) {
  const holdMs = opts?.holdMs ?? 1000
  emotionState.type = type
  emotionState.target = Math.max(0, Math.min(1, intensity))
  // Gently underdamped — enough for a soft settle-wobble, not a boing.
  emotionState.stiffness = opts?.stiffness ?? 120
  emotionState.damping = opts?.damping ?? 16
  emotionState.holdUntil = performance.now() + holdMs
  // Anticipation: a small kick in the opposite direction of travel before
  // the spring's own pull takes over, so a rising reaction visibly winds
  // up first instead of just accelerating from a standstill.
  if (emotionState.target > emotionState.current) {
    emotionState.velocity -= 0.6
  }
}

/** Eases immediately back toward neutral, skipping any remaining hold. */
export function clearEmotion() {
  emotionState.target = 0
  emotionState.holdUntil = 0
}

/**
 * Advances the emotion engine by one frame and returns the live intensity
 * to apply this frame (roughly 0..1, but can briefly swing a little past
 * either end during overshoot/recoil — that's intentional cartoon physics,
 * not a bug, so callers should expect and lean into it rather than clamp
 * it away). Call once per animation frame — AliceCloud does this at the
 * top of its render loop, right after easing the activity profile.
 */
export function updateEmotion(now: number): number {
  if (emotionState.current >= emotionState.target && now > emotionState.holdUntil) {
    emotionState.target = 0
  }

  // Variable-timestep spring: dt clamped so a dropped frame or a tab that
  // was backgrounded doesn't fling the spring to infinity.
  const dt = emotionState.lastTick
    ? Math.min(0.05, Math.max(0, (now - emotionState.lastTick) / 1000))
    : 1 / 60
  emotionState.lastTick = now

  const accel =
    (emotionState.target - emotionState.current) * emotionState.stiffness -
    emotionState.velocity * emotionState.damping
  emotionState.velocity += accel * dt
  emotionState.current += emotionState.velocity * dt

  if (
    Math.abs(emotionState.current) < 0.002 &&
    Math.abs(emotionState.velocity) < 0.01 &&
    emotionState.target === 0
  ) {
    emotionState.current = 0
    emotionState.velocity = 0
  }

  return emotionState.current
}