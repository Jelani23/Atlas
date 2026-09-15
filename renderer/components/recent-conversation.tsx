"use client"

import { useState } from "react"
import { ChevronRight, MessageCircle } from "lucide-react"
import { previewLine } from "@/lib/response-preview"
import type { Message } from "@/lib/types"
import { CloudSkin } from "./cloud-skin"

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
        className="relative isolate flex h-11 w-12 items-center justify-center text-sky-deep/70 transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
        aria-label="Show recent conversation"
        title="Recent conversation"
      >
        <CloudSkin asset="panelSquare" className="-inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] opacity-62" />
        <MessageCircle className="relative z-10 h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="animate-alice-unfold relative isolate ml-auto w-[min(19rem,46vw)] min-h-[9rem] text-left">
      <CloudSkin asset="panelWide" className="-inset-7 h-[calc(100%+3.5rem)] w-[calc(100%+3.5rem)] opacity-70" />
      <div className="relative z-10 px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-sky-deep/65" strokeWidth={1.8} aria-hidden="true" />
          <span className="font-display text-[16px] leading-none text-foreground/76">Recent chat</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="alice-icon-button ml-auto flex h-7 w-7 items-center justify-center text-foreground/38 hover:bg-white/30 hover:text-foreground/65"
            aria-label="Collapse recent conversation"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <button type="button" onClick={onOpen} className="group block w-full cursor-pointer text-left">
          <ul className="space-y-1">
            {recent.map((m) => (
              <li key={m.id} className="truncate text-xs leading-relaxed text-foreground/46 transition-colors group-hover:text-foreground/58">
                <span className="font-medium text-foreground/68">{m.role === "atlas" ? "Alice: " : "You: "}</span>
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
