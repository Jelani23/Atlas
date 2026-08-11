"use client"

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

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let buffer: Uint8Array | null = null
let playing = false
let loopStarted = false

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
