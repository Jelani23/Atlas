"use client"

import { useState } from "react"
import { ChevronRight, MessageCircle } from "lucide-react"
import { previewLine } from "@/lib/response-preview"
import type { Message } from "@/lib/types"

interface RecentConversationProps {
  messages: Message[]
  onOpen: () => void
  count?: number
}

export function RecentConversation({ messages, onOpen, count = 3 }: RecentConversationProps) {
  const [expanded, setExpanded] = useState(false)

  if (messages.length === 0) return null

  const recent = messages.slice(-count)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="alice-edge-tab relative flex h-10 w-10 items-center justify-center text-sky-deep/70"
        aria-label="Show recent conversation"
        title="Recent conversation"
      >
        <span className="pointer-events-none absolute -right-1 top-0 h-3.5 w-3.5 rounded-full bg-white/18" />
        <MessageCircle className="relative h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="relative isolate ml-auto w-[min(18rem,44vw)]">
      <span className="pointer-events-none absolute -right-2 bottom-4 -z-10 h-11 w-11 rounded-full bg-white/22 blur-[1px]" />
      <span className="pointer-events-none absolute right-7 -top-2 -z-10 h-9 w-14 rounded-full bg-white/17 blur-[1px]" />

      <div className="alice-surface-soft animate-alice-unfold px-4 py-3.5 text-left">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-sky-deep/65" strokeWidth={1.8} aria-hidden="true" />
          <span className="font-display text-[16px] leading-none text-foreground/76">Recent chat</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="alice-icon-button ml-auto flex h-7 w-7 items-center justify-center text-foreground/38 hover:bg-white/36 hover:text-foreground/65"
            aria-label="Collapse recent conversation"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <button type="button" onClick={onOpen} className="group block w-full cursor-pointer text-left">
          <ul className="space-y-1">
            {recent.map((m) => (
              <li key={m.id} className="truncate text-xs leading-relaxed text-foreground/46 transition-colors group-hover:text-foreground/58">
                <span className="font-medium text-foreground/68">
                  {m.role === "atlas" ? "Alice: " : "You: "}
                </span>
                {previewLine(m.text)}
              </li>
            ))}
          </ul>
          <span className="mt-2 inline-block font-display text-[13px] text-sky-deep/58 transition-transform group-hover:translate-x-0.5">
            Open conversation →
          </span>
        </button>
      </div>
    </div>
  )
}
