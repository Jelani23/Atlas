"use client"

import { useEffect, useRef } from "react"
import type { Message } from "@/lib/types"

interface ConversationThreadProps {
  messages: Message[]
  typing: boolean
  /** id of the message to scroll to/highlight on mount, e.g. arriving from "View full response" */
  focusMessageId?: string | null
}

export function ConversationThread({ messages, typing, focusMessageId }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusMessageId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, focusMessageId])

  if (messages.length === 0 && !typing) {
    return (
      <div className="flex h-full flex-1 items-center justify-center px-6 text-center">
        <p className="font-display text-lg font-medium text-muted-foreground/70 text-balance">
          No conversation yet.
          <span className="mt-1 block text-sm font-normal text-muted-foreground/50">
            Anything you ask Alice shows up here in full.
          </span>
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 themed-scroll">
      {messages.map((m) => (
        <div
          key={m.id}
          ref={m.id === focusMessageId ? focusRef : undefined}
          className={`flex flex-col gap-1 rounded-2xl px-4 py-3 ${
            m.role === "atlas"
              ? "self-start bg-card/70 border border-border/60"
              : "self-end bg-primary/10"
          } max-w-[85%] ${m.id === focusMessageId ? "ring-2 ring-primary/40" : ""}`}
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary/70">
            {m.role === "atlas" ? "Alice" : "You"}
          </span>
          <p className="whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">
            {m.text}
          </p>
        </div>
      ))}

      {typing && (
        <div className="flex items-center gap-1.5 self-start rounded-2xl border border-border/60 bg-card/70 px-4 py-3">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.2s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.1s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
