"use client"

import { useRef } from "react"
import { speechLevel, visemeShape } from "@/lib/audio-level"
import type { VisemeShape } from "@/lib/visemes"

export interface AudioVisemeRefs {
  /** Live TTS amplitude, 0..1, heavily smoothed. Same signal AliceCloud
   *  already reads as `speechLevel` — re-exported here under one API. */
  amplitude: { current: number }
  /** Live viseme shape (openness/width/roundness), 0..1 each. Equals
   *  NEUTRAL_SHAPE whenever no phoneme timestamps are available for the
   *  chunk currently playing (see lib/visemes.ts). */
  shape: { current: VisemeShape }
}

/**
 * Exposes Atlas's shared live audio-analysis signals for components that
 * read them inside a `requestAnimationFrame` loop (canvas/WebGL avatars,
 * etc.) rather than through React state/re-renders.
 *
 * Deliberately does NOT create its own AudioContext/AnalyserNode. Web Audio
 * only allows a `MediaElementSource` to be created once per <audio>
 * element (a second attempt throws), and Atlas already routes every TTS
 * chunk through one shared analyser graph in lib/audio-level.ts as chunks
 * are queued for playback. Standing up a second graph here would either
 * throw on every chunk or silently do nothing — this hook just gives
 * ergonomic, typed, ref-based access to that existing graph's output
 * instead, which is also why it adds zero extra latency: no new work
 * happens per frame beyond what audio-level.ts already does.
 *
 * Usage inside a render loop:
 *   const { amplitude, shape } = useAudioViseme()
 *   // ...inside requestAnimationFrame callback:
 *   const level = amplitude.current        // 0..1
 *   const { openness, width, roundness } = shape.current
 */
export function useAudioViseme(): AudioVisemeRefs {
  const refs = useRef<AudioVisemeRefs>({ amplitude: speechLevel, shape: visemeShape })
  return refs.current
}
