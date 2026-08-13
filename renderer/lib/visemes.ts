// Phoneme -> viseme mapping, plus the timeline helpers used to figure out
// which viseme is "active" at any given `audio.currentTime`.
//
// IMPORTANT CONTEXT FOR WHOEVER TOUCHES THIS NEXT:
// Alice isn't a face — she's an abstract cloud silhouette (see
// components/alice-cloud.tsx) with no literal mouth geometry. So "viseme"
// here doesn't mean "which mouth sprite to show" — it means a small set of
// continuous shape parameters (openness / width / roundness) that nudge the
// cloud's existing squash-stretch rig toward a shape that *reads* as that
// sound, the same way the emotion system nudges it toward "sad" or "happy".
// See VISEME_SHAPES below and how alice-cloud.tsx blends them in.

export type Viseme =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U"

export interface VisemeShape {
  /** 0 = mouth closed, 1 = fully open */
  openness: number
  /** 0 = narrow/pursed, 1 = wide/spread */
  width: number
  /** 0 = spread, 1 = fully rounded/pursed (o/u shapes) */
  roundness: number
}

/** One phoneme with its timing, as would come from a forced aligner or a
 *  phoneme-timestamp-capable TTS engine. Timestamps are in seconds, measured
 *  from the start of the audio chunk they belong to (i.e. they should line
 *  up directly against that chunk's `<audio>` element's `currentTime`). */
export interface PhonemeTimestamp {
  /** ARPAbet token (stress digits like "AH0" are fine — they're stripped). */
  phoneme: string
  start: number
  end: number
}

export interface VisemeCue {
  viseme: Viseme
  start: number
  end: number
}

// Standard ARPAbet -> viseme grouping (Preston Blair style categories).
// Approximate by design — the goal is a plausible mouth-shape *class* for
// each sound, not phonetic precision.
const ARPABET_TO_VISEME: Record<string, Viseme> = {
  // Bilabials — lips pressed together
  P: "PP",
  B: "PP",
  M: "PP",
  // Labiodentals — teeth on lower lip
  F: "FF",
  V: "FF",
  // Dentals
  TH: "TH",
  DH: "TH",
  // Alveolar plosives
  T: "DD",
  D: "DD",
  // Velars (+ velar nasal)
  K: "kk",
  G: "kk",
  NG: "kk",
  // Affricates / postalveolar fricatives
  CH: "CH",
  JH: "CH",
  SH: "CH",
  ZH: "CH",
  // Sibilants
  S: "SS",
  Z: "SS",
  // Alveolar nasal / lateral
  N: "nn",
  L: "nn",
  // Rhotic
  R: "RR",
  ER: "RR",
  // Open vowels
  AA: "aa",
  AE: "aa",
  AH: "aa",
  AY: "aa",
  AW: "aa",
  AX: "aa",
  // Mid front vowels
  EH: "E",
  EY: "E",
  // Close front vowels / glide
  IH: "I",
  IY: "I",
  Y: "I",
  // Mid back rounded vowels
  AO: "O",
  OW: "O",
  OY: "O",
  // Close back rounded vowels / glide
  UW: "U",
  UH: "U",
  W: "U",
  // Silence / pause markers some aligners emit
  SIL: "sil",
  SP: "sil",
  "": "sil",
}

/** Neutral shape — deliberately equal to the bias midpoints used when
 *  blending shape into the cloud rig (see alice-cloud.tsx), so "no timeline
 *  data" produces exactly zero visual bias rather than snapping to `sil`. */
export const NEUTRAL_SHAPE: VisemeShape = { openness: 0.3, width: 0.5, roundness: 0.3 }

export const VISEME_SHAPES: Record<Viseme, VisemeShape> = {
  sil: { openness: 0.05, width: 0.5, roundness: 0.3 },
  PP: { openness: 0.02, width: 0.45, roundness: 0.35 },
  FF: { openness: 0.15, width: 0.55, roundness: 0.25 },
  TH: { openness: 0.25, width: 0.5, roundness: 0.25 },
  DD: { openness: 0.3, width: 0.55, roundness: 0.3 },
  kk: { openness: 0.35, width: 0.5, roundness: 0.3 },
  CH: { openness: 0.3, width: 0.4, roundness: 0.55 },
  SS: { openness: 0.2, width: 0.6, roundness: 0.25 },
  nn: { openness: 0.25, width: 0.5, roundness: 0.3 },
  RR: { openness: 0.35, width: 0.45, roundness: 0.5 },
  aa: { openness: 0.9, width: 0.65, roundness: 0.35 },
  E: { openness: 0.55, width: 0.7, roundness: 0.3 },
  I: { openness: 0.35, width: 0.75, roundness: 0.15 },
  O: { openness: 0.65, width: 0.35, roundness: 0.85 },
  U: { openness: 0.4, width: 0.25, roundness: 0.95 },
}

/** Maps a raw phoneme token (ARPAbet, optionally with a trailing stress
 *  digit like "AH0"/"AH1"/"AH2") to one of the 15 visemes. Unknown tokens
 *  fall back to "sil" rather than throwing, since TTS/aligner phoneme sets
 *  vary and a bad frame of animation is better than a crashed render loop. */
export function phonemeToViseme(token: string): Viseme {
  if (!token) return "sil"
  const clean = token.trim().toUpperCase().replace(/[0-9]/g, "")
  return ARPABET_TO_VISEME[clean] ?? "sil"
}

export function getVisemeShape(viseme: Viseme): VisemeShape {
  return VISEME_SHAPES[viseme]
}

/** Converts a raw phoneme timestamp list into a viseme timeline, merging
 *  consecutive phonemes that map to the same viseme so we're not doing
 *  needless lookups for e.g. back-to-back nasal/liquid runs. Assumes the
 *  input is already sorted by `start` (true for forced-aligner output). */
export function buildVisemeTimeline(phonemes: PhonemeTimestamp[]): VisemeCue[] {
  const cues: VisemeCue[] = []
  for (const p of phonemes) {
    const viseme = phonemeToViseme(p.phoneme)
    const last = cues[cues.length - 1]
    if (last && last.viseme === viseme && p.start <= last.end + 0.02) {
      last.end = p.end
    } else {
      cues.push({ viseme, start: p.start, end: p.end })
    }
  }
  return cues
}

/** Binary search for the cue covering `t` (seconds). Returns null if `t`
 *  falls before/after all cues (silence, or timeline exhausted). */
export function getActiveViseme(timeline: VisemeCue[], t: number): Viseme | null {
  if (timeline.length === 0) return null
  let lo = 0
  let hi = timeline.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const cue = timeline[mid]
    if (t < cue.start) hi = mid - 1
    else if (t > cue.end) lo = mid + 1
    else return cue.viseme
  }
  return null
}

const lerpShape = (a: VisemeShape, b: VisemeShape, w: number): VisemeShape => ({
  openness: a.openness + (b.openness - a.openness) * w,
  width: a.width + (b.width - a.width) * w,
  roundness: a.roundness + (b.roundness - a.roundness) * w,
})

const CROSSFADE_S = 0.04

/** The shape to render at time `t`: the active cue's shape, softly
 *  crossfaded into the next cue over the last `CROSSFADE_S` seconds of the
 *  current one so visemes blend instead of snapping. Falls back to
 *  `NEUTRAL_SHAPE` (zero bias, see above) when there's no timeline data at
 *  all — this is what keeps the feature inert until phoneme timestamps
 *  actually exist. */
export function getShapeAtTime(timeline: VisemeCue[], t: number): VisemeShape {
  if (timeline.length === 0) return NEUTRAL_SHAPE

  // Find the cue index containing or immediately following t.
  let idx = timeline.findIndex((c) => t <= c.end)
  if (idx === -1) return NEUTRAL_SHAPE // past the end of the timeline
  if (t < timeline[idx].start) {
    // In a gap between cues (or before the first one) — treat as silence.
    return VISEME_SHAPES.sil
  }

  const cue = timeline[idx]
  const shape = getVisemeShape(cue.viseme)
  const next = timeline[idx + 1]
  if (!next) return shape

  const remaining = cue.end - t
  if (remaining <= CROSSFADE_S && next.start - cue.end <= CROSSFADE_S) {
    const w = 1 - remaining / CROSSFADE_S
    return lerpShape(shape, getVisemeShape(next.viseme), clamp01(w))
  }
  return shape
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}
