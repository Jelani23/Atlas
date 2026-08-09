"use client"

import { previewResponse } from "@/lib/response-preview"
import type { Message } from "@/lib/types"

interface HomeResponseProps {
  messages: Message[]
  typing: boolean
  onContinueInConversations: () => void
}

export function HomeResponse({
  messages,
  typing,
  onContinueInConversations,
}: HomeResponseProps) {
  const latest = messages[messages.length - 1]
  const { preview, isTruncated } =
    latest?.role === "atlas" ? previewResponse(latest.text) : { preview: "", isTruncated: false }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center px-2 text-center">
      {!latest && !typing && (
        <p className="font-display text-lg font-medium text-muted-foreground/80 text-balance">
          {"Hi, I'm Atlas."}
          <span className="mt-1 block text-sm font-normal text-muted-foreground/60">
            A calm presence, here whenever you need me.
          </span>
        </p>
      )}

      {latest && (
        <div
          key={latest.id}
          className="animate-rise min-h-0 w-full flex-1 overflow-y-auto themed-scroll"
        >
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">
            {latest.role === "atlas" ? "Atlas" : "You"}
          </p>
          <p
            className={`text-pretty leading-relaxed ${
              latest.role === "atlas"
                ? "font-display text-xl font-medium text-foreground md:text-2xl"
                : "text-base text-muted-foreground"
            }`}
          >
            {latest.role === "atlas" ? preview : latest.text}
          </p>

          {latest.role === "atlas" && isTruncated && (
            <button
              type="button"
              onClick={onContinueInConversations}
              className="mt-2.5 cursor-pointer text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary/80"
            >
              View full response →
            </button>
          )}
        </div>
      )}

      {typing && (
        <div className="mt-3 flex -translate-y-2 items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.2s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.1s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" />
        </div>
      )}
    </div>
  )
}
