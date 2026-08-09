export type AtlasState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "working"
  | "error"

export const STATE_LABEL: Record<AtlasState, string> = {
  idle: "Resting",
  listening: "Listening",
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
  // rgb tint for the cool inner cloud layers + halo
  tint: [number, number, number]
}

export const STATE_PROFILE: Record<AtlasState, StateProfile> = {
  idle: {
    speed: 0.32,
    drift: 0.62,
    breath: 0.02,
    speech: 0,
    wisp: 0.32,
    particles: 0.28,
    glow: 0.5,
    rays: 0.38,
    tint: [186, 214, 242],
  },
  listening: {
    speed: 0.48,
    drift: 0.8,
    breath: 0.032,
    speech: 0,
    wisp: 0.5,
    particles: 0.48,
    glow: 0.72,
    rays: 0.52,
    tint: [176, 210, 244],
  },
  thinking: {
    speed: 0.78,
    drift: 0.95,
    breath: 0.032,
    speech: 0,
    wisp: 0.9,
    particles: 0.75,
    glow: 0.78,
    rays: 0.58,
    tint: [168, 202, 240],
  },
  speaking: {
    speed: 0.58,
    drift: 0.78,
    breath: 0.028,
    speech: 1,
    wisp: 0.55,
    particles: 0.52,
    glow: 0.85,
    rays: 0.6,
    tint: [196, 220, 248],
  },
  working: {
    speed: 1.0,
    drift: 1.0,
    breath: 0.04,
    speech: 0.3,
    wisp: 0.95,
    particles: 0.95,
    glow: 0.95,
    rays: 0.72,
    tint: [232, 210, 160],
  },
  error: {
    speed: 0.6,
    drift: 0.9,
    breath: 0.025,
    speech: 0,
    wisp: 0.4,
    particles: 0.35,
    glow: 0.6,
    rays: 0.3,
    tint: [232, 168, 168],
  },
}
