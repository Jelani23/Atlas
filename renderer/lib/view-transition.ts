import type { CSSProperties } from "react"
import { flushSync } from "react-dom"

type AtlasViewTransition = {
  finished: Promise<void>
}

type AtlasTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => AtlasViewTransition
}

const CLOUD_TRANSITIONS = [
  "alice-thought-cloud",
  "alice-recent-cloud",
  "atlas-cloud-status",
  "atlas-host-status",
]

function ensureViewTransitionOverrides() {
  if (typeof document === "undefined") return
  if (document.getElementById("atlas-view-transition-overrides")) return

  const style = document.createElement("style")
  style.id = "atlas-view-transition-overrides"

  const oldSelectors = CLOUD_TRANSITIONS.map((name) => `::view-transition-old(${name})`).join(",\n")
  const newSelectors = CLOUD_TRANSITIONS.map((name) => `::view-transition-new(${name})`).join(",\n")

  style.textContent = `
${oldSelectors} {
  opacity: 0 !important;
  animation: none !important;
  mix-blend-mode: normal !important;
}

${newSelectors} {
  opacity: 1 !important;
  animation: none !important;
  mix-blend-mode: normal !important;
}
`

  document.head.appendChild(style)
}

export function runViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update()
    return
  }

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const transitionDocument = document as AtlasTransitionDocument

  if (reducedMotion || !transitionDocument.startViewTransition) {
    update()
    return
  }

  ensureViewTransitionOverrides()

  transitionDocument.startViewTransition(() => {
    // React state updates are normally asynchronous. View Transitions need the
    // destination DOM to exist before the browser captures the "new" snapshot,
    // otherwise the previous bubble/panel can flash for a frame.
    flushSync(update)
  })
}

export function viewTransitionStyle(name: string): CSSProperties {
  return { viewTransitionName: name } as CSSProperties
}
