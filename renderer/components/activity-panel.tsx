"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, Sparkles } from "lucide-react"
import { type AtlasState, STATE_LABEL } from "./atlas-state"

interface ActivityPanelProps {
  steps: string[]
  state: AtlasState
}

export function ActivityPanel({ steps, state }: ActivityPanelProps) {
  const active = state === "thinking" || state === "working"
  const dormant = state === "dormant"
  const [expanded, setExpanded] = useState(active)

  useEffect(() => {
    if (active) setExpanded(true)
  }, [active])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="alice-edge-tab pointer-events-auto flex h-10 w-10 items-center justify-center text-sky-deep/75"
        aria-label="Show Alice's current thoughts"
        title="Alice's thoughts"
      >
        <Sparkles className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="alice-surface-soft animate-alice-page-in pointer-events-auto w-[min(18rem,44vw)] select-none px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles
          className={`h-4 w-4 text-sky-deep/70 ${active ? "animate-pulse" : ""} ${dormant ? "opacity-35" : ""}`}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="font-display text-[16px] leading-none text-foreground/76">Alice's thoughts</span>
        <span className="ml-auto text-[11px] text-foreground/42">{STATE_LABEL[state]}</span>
        {!active && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="alice-icon-button -mr-1 flex h-7 w-7 items-center justify-center text-foreground/38 hover:bg-white/36 hover:text-foreground/65"
            aria-label="Collapse thought panel"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ul className="space-y-1.5">
        {steps.length === 0 && (
          <li className="text-xs leading-relaxed text-foreground/48">
            {dormant ? "Alice is quiet while the host is offline." : "Nothing on her mind right now."}
          </li>
        )}
        {!dormant && steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={`${step}-${i}`} className="flex animate-rise items-center gap-2 text-xs leading-relaxed">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  isLast && active ? "bg-sky-deep/65" : "bg-foreground/18"
                }`}
              />
              <span className={isLast ? "font-medium text-foreground/72" : "text-foreground/38"}>
                {step}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
