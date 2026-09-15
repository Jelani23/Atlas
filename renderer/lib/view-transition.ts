import type { CSSProperties } from "react"

type AtlasViewTransition = {
  finished: Promise<void>
}

type AtlasTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => AtlasViewTransition
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

  transitionDocument.startViewTransition(update)
}

export function viewTransitionStyle(name: string): CSSProperties {
  return { viewTransitionName: name } as CSSProperties
}
