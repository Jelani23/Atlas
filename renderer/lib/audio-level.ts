"use client"

import {
  buildVisemeTimeline,
  getShapeAtTime,
  NEUTRAL_SHAPE,
  type PhonemeTimestamp,
  type VisemeCue,
  type VisemeShape,
} from "./visemes"

// Shared, mutable amplitude signal (0..1) sampled live from whatever TTS
// audio chunk is currently playing. AliceCloud reads `speechLevel.current`
// every animation frame so her "speaking" motion follows Alice's actual
// voice instead of a simulated cadence. The audio queue/playback manager in
// atlas-app.tsx is the only writer — it calls `attachAudioElement()` on
// each new <audio> chunk before playing it, and `setPlaying()` as the
// queue starts/drains.
//
// Kept as a plain module-level object (like the *Ref patterns already used
// in AliceCloud) rather than React state, since it's read inside a canvas
// render loop every frame — pushing it through props/state would just
// cause needless re-renders for a value nothing ever displays as text.

export const speechLevel = { current: 0 }

// Live viseme SHAPE (openness/width/roundness), driven by whichever phoneme
// timestamps came with the chunk currently playing. See lib/visemes.ts for
// why this is a shape rather than a discrete sprite selection. Sits right
// next to speechLevel because the two are meant to be combined: shape says
// *what* Alice's mouth-adjacent motion should look like, speechLevel/
// amplitude says *how much* of it should show right now (see
// hooks/useAudioViseme.ts and its usage in AliceCloud).
export const visemeShape: { current: VisemeShape } = { current: { ...NEUTRAL_SHAPE } }

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let buffer: Uint8Array | null = null
let playing = false
let loopStarted = false

// Viseme timeline tracking for the chunk currently assigned via
// setVisemeSource(). Deliberately separate from the analyser graph above —
// this only needs the <audio> element's `currentTime`, not its samples.
let visemeAudioEl: HTMLAudioElement | null = null
let visemeTimeline: VisemeCue[] = []

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function tick() {
  if (analyser && buffer && playing) {
    analyser.getByteTimeDomainData(buffer)
    let sumSq = 0
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128
      sumSq += v * v
    }
    const rms = Math.sqrt(sumSq / buffer.length)
    // Small perceptual boost so quieter speech still reads as motion, then
    // heavily smoothed so the envelope flows rather than jitters frame to
    // frame with every waveform zero-crossing.
    const target = Math.min(1, rms * 3.2)
    speechLevel.current = lerp(speechLevel.current, target, 0.3)
  } else {
    speechLevel.current = lerp(speechLevel.current, 0, 0.08)
  }

  // Sample the active viseme shape from the currently-tracked audio
  // element's playback position. No timeline (the common case today, since
  // no TTS provider is wired to emit phoneme timestamps yet — see
  // visemes.ts / the "Required Backend Changes" note) means
  // getShapeAtTime() always returns NEUTRAL_SHAPE, so this is a no-op.
  const targetShape =
    visemeAudioEl && !visemeAudioEl.paused && visemeTimeline.length > 0
      ? getShapeAtTime(visemeTimeline, visemeAudioEl.currentTime)
      : NEUTRAL_SHAPE
  // Fast-ish ease so mouth-shape changes feel responsive to phonemes
  // (which can be as short as ~60-100ms) without popping frame to frame.
  visemeShape.current = {
    openness: lerp(visemeShape.current.openness, targetShape.openness, 0.45),
    width: lerp(visemeShape.current.width, targetShape.width, 0.45),
    roundness: lerp(visemeShape.current.roundness, targetShape.roundness, 0.45),
  }

  requestAnimationFrame(tick)
}

function ensureGraph(): boolean {
  if (ctx && analyser && buffer) return true
  if (typeof window === "undefined") return false
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return false
  ctx = new Ctx()
  analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.65
  analyser.connect(ctx.destination)
  buffer = new Uint8Array(analyser.frequencyBinCount)
  if (!loopStarted) {
    loopStarted = true
    requestAnimationFrame(tick)
  }
  return true
}

/**
 * Routes a freshly-created TTS <audio> element through the shared analyser
 * so its live amplitude feeds `speechLevel`. Call this once per chunk,
 * before/around calling `.play()`. Safe to no-op if Web Audio isn't
 * available — playback still works normally either way, Alice just falls
 * back to her simulated speaking cadence.
 */
export function attachAudioElement(audio: HTMLAudioElement) {
  if (!ensureGraph() || !ctx || !analyser) return
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {})
  }
  try {
    const source = ctx.createMediaElementSource(audio)
    source.connect(analyser)
  } catch {
    // Can throw if this exact element was already routed, or in
    // environments without MediaElementSource support — harmless.
  }
}

/** Marks whether TTS audio is actively playing right now. */
export function setPlaying(value: boolean) {
  playing = value
}

/**
 * Points the viseme sampler at the <audio> element currently playing and
 * (optionally) its phoneme timestamps, so `visemeShape.current` tracks that
 * chunk's mouth shape over time. Call once per chunk, same as
 * attachAudioElement() — cheap either way: with no `phonemes` (today's
 * reality for every existing TTS provider) this just clears the timeline
 * and visemeShape eases back to NEUTRAL_SHAPE.
 */
export function setVisemeSource(audio: HTMLAudioElement | null, phonemes?: PhonemeTimestamp[]) {
  visemeAudioEl = audio
  visemeTimeline = phonemes && phonemes.length > 0 ? buildVisemeTimeline(phonemes) : []
}
