export type AtlasState = 
| "dormant"
| "idle" 
| "listening" 
| "transcribing" 
| "thinking" 
| "working" 
| "speaking" 
| "error"

export const STATE_LABEL: Record<AtlasState, string> = {
  dormant: "Offline",
  idle: "Resting",
  listening: "Listening",
  transcribing: "Transcribing",
  thinking: "Thinking",
  speaking: "Speaking",
  working: "Working",
  error: "Needs attention",
}

// Per-state tuning for the cloud visualization.
export interface StateProfile {
  // overall motion-speed multiplier for drifting/flowing
  speed: number
  // organic per-lobe drift + shape-shift multiplier
  drift: number
  // slow whole-cloud breathing scale range
  breath: number
  // speaking "open/close" stretch intensity (0 = none)
  speech: number
  // internal wisp / flowing-light activity 0..1
  wisp: number
  // particle liveliness 0..1
  particles: number
  // warm sunlight backlight + rim intensity 0..1
  glow: number
  // sun-ray reach/visibility 0..1
  rays: number
  // slow "jello" squash/stretch wobble intensity 0..1
  wobble: number
  // rgb tint for the cool inner cloud layers + halo
  tint: [number, number, number]
}

export const STATE_PROFILE: Record<AtlasState, StateProfile> = {
  dormant: {
    speed: 0.16,
    drift: 0.32,
    breath: 0.025,
    speech: 0,
    wisp: 0.04,
    particles: 0.02,
    glow: 0.16,
    rays: 0.08,
    wobble: 0.12,
    tint: [182, 197, 214],
  },
  idle: {
    speed: 0.55,
    drift: 1.0,
    breath: 0.075,
    speech: 0,
    wisp: 0.32,
    particles: 0.28,
    glow: 0.5,
    rays: 0.38,
    wobble: 1.15,
    tint: [186, 214, 242],
  },
  transcribing: {
    speed: 0.55,
    drift: 1.0,
    breath: 0.075,
    speech: 0,
    wisp: 0.32,
    particles: 0.28,
    glow: 0.5,
    rays: 0.38,
    wobble: 1.15,
    tint: [186, 214, 242],
  },
  listening: {
    speed: 0.75,
    drift: 1.15,
    breath: 0.09,
    speech: 0,
    wisp: 0.5,
    particles: 0.48,
    glow: 0.72,
    rays: 0.52,
    wobble: 0.8,
    tint: [176, 210, 244],
  },
  thinking: {
    speed: 1.15,
    drift: 1.35,
    breath: 0.1,
    speech: 0,
    wisp: 0.9,
    particles: 0.75,
    glow: 0.78,
    rays: 0.58,
    wobble: 0.55,
    tint: [168, 202, 240],
  },
  speaking: {
    speed: 0.85,
    drift: 1.1,
    breath: 0.08,
    speech: 3,
    wisp: 0.55,
    particles: 0.52,
    glow: 0.85,
    rays: 0.6,
    wobble: 0.35,
    tint: [196, 220, 248],
  },
  working: {
    speed: 1.4,
    drift: 1.5,
    breath: 0.12,
    speech: 0.3,
    wisp: 0.95,
    particles: 0.95,
    glow: 0.95,
    rays: 0.72,
    wobble: 0.4,
    tint: [232, 210, 160],
  },
  error: {
    speed: 1.0,
    drift: 1.3,
    breath: 0.09,
    speech: 0,
    wisp: 0.4,
    particles: 0.35,
    glow: 0.6,
    rays: 0.3,
    wobble: 0.5,
    tint: [232, 168, 168],
  },
}
