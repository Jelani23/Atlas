"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { Copy, Minus, Square, X } from "lucide-react"
import "@/lib/window-controls"

const NO_DRAG: CSSProperties = { WebkitAppRegion: "no-drag" } as CSSProperties

export function TitleBarControls() {
  const [maximized, setMaximized] = useState(false)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const controls = window.windowControls
    if (!controls) return
    setAvailable(true)
    controls.isMaximized().then(setMaximized)
    const unsubscribe = controls.onMaximizeChange(setMaximized)
    return unsubscribe
  }, [])

  if (!available) return null
  const controls = window.windowControls!

  return (
    <div className="flex items-center gap-1" style={NO_DRAG}>
      <button
        type="button"
        onClick={() => controls.minimize()}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Minimize"
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => controls.maximize()}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? (
          <Copy className="h-3.5 w-3.5 -scale-x-100" aria-hidden="true" />
        ) : (
          <Square className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={() => controls.close()}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        aria-label="Close"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
