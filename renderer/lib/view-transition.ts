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

  // Chrome aborts View Transitions with InvalidStateError while the document is
  // hidden (for example during initial tab startup or when switching tabs).
  // Apply the state change normally in that case instead of attempting animation.
  if (
    reducedMotion ||
    document.visibilityState !== "visible" ||
    !transitionDocument.startViewTransition
  ) {
    update()
    return
  }

  ensureViewTransitionOverrides()

  let applied = false

  try {
    const transition = transitionDocument.startViewTransition(() => {
      // React state updates are normally asynchronous. View Transitions need the
      // destination DOM to exist before the browser captures the "new" snapshot,
      // otherwise the previous bubble/panel can flash for a frame.
      flushSync(() => {
        update()
        applied = true
      })
    })

    // The document can become hidden after startViewTransition() succeeds but
    // before the transition finishes. Consume that browser abort so it does not
    // surface as an unhandled rejection, and make sure the requested state update
    // still happens if the transition was cancelled before its callback ran.
    void transition.finished.catch(() => {
      if (!applied) {
        flushSync(() => {
          update()
          applied = true
        })
      }
    })
  } catch {
    // A visibility change can also make startViewTransition throw synchronously.
    // Falling back to the plain update keeps the UI responsive either way.
    if (!applied) {
      update()
    }
  }
}

export function viewTransitionStyle(name: string): CSSProperties {
  return { viewTransitionName: name } as CSSProperties
}
