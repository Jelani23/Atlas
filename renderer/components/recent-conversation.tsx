"use client"

import { MessageCircle } from "lucide-react"
import { previewLine } from "@/lib/response-preview"
import type { Message } from "@/lib/types"

interface RecentConversationProps {
  messages: Message[]
  onOpen: () => void
  /** how many of the most recent messages to show, default 3 */
  count?: number
}

export function RecentConversation({ messages, onOpen, count = 3 }: RecentConversationProps) {
  if (messages.length === 0) return null

  const recent = messages.slice(-count)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group ml-auto w-[min(18rem,44vw)] cursor-pointer rounded-2xl border border-border/60 bg-card/55 p-3.5 text-left backdrop-blur-md shadow-[0_8px_30px_-12px_rgba(80,130,190,0.35)] transition-colors hover:bg-card/70"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          Recent conversation
        </span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.12em] text-primary/70 opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </span>
      </div>

      <ul className="space-y-1">
        {recent.map((m) => (
          <li key={m.id} className="truncate text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {m.role === "atlas" ? "Atlas: " : "You: "}
            </span>
            {previewLine(m.text)}
          </li>
        ))}
      </ul>
    </button>
  )
}
