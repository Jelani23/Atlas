"use client"

import { Sparkles } from "lucide-react"
import { type AtlasState, STATE_LABEL } from "./atlas-state"

interface ActivityPanelProps {
  steps: string[]
  state: AtlasState
}

export function ActivityPanel({ steps, state }: ActivityPanelProps) {
  const active = state === "thinking" || state === "working"

  return (
    <div className="pointer-events-none w-[min(18rem,44vw)] select-none">
      <div className="rounded-2xl border border-border/60 bg-card/55 p-3.5 backdrop-blur-md shadow-[0_8px_30px_-12px_rgba(80,130,190,0.35)]">
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary ${
              active ? "animate-pulse" : ""
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            Thought path
          </span>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.12em] text-primary/70">
            {STATE_LABEL[state]}
          </span>
        </div>

        <ul className="space-y-1.5">
          {steps.length === 0 && (
            <li className="text-xs leading-relaxed text-muted-foreground/70">
              Atlas is resting. Ask her anything.
            </li>
          )}
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            return (
              <li
                key={`${step}-${i}`}
                className="flex animate-rise items-center gap-2 text-xs leading-relaxed"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isLast && active
                      ? "bg-primary shadow-[0_0_0_3px_rgba(120,185,240,0.25)]"
                      : "bg-muted-foreground/40"
                  }`}
                />
                <span
                  className={
                    isLast
                      ? "font-medium text-foreground"
                      : "text-muted-foreground line-through decoration-muted-foreground/30"
                  }
                >
                  {step}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
