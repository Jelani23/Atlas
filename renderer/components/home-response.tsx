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
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center px-3 text-center">
      {!latest && !typing && (
        <div className="animate-rise text-balance">
          <p className="font-display text-[24px] leading-none text-foreground/78 md:text-[28px]">
            Hi, I'm Alice.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground/43 md:text-[15px]">
            What's on your mind?
          </p>
        </div>
      )}

      {latest && (
        <div
          key={latest.id}
          className="animate-rise min-h-0 w-full flex-1 overflow-y-auto themed-scroll"
        >
          <span className="mb-1.5 inline-block font-display text-[13px] text-sky-deep/48">
            {latest.role === "atlas" ? "Alice" : "You"}
          </span>
          <p
            className={`text-pretty leading-relaxed ${
              latest.role === "atlas"
                ? "text-[20px] text-foreground/82 md:text-[24px]"
                : "text-[16px] text-foreground/55"
            }`}
          >
            {latest.role === "atlas" ? preview : latest.text}
          </p>

          {latest.role === "atlas" && isTruncated && (
            <button
              type="button"
              onClick={onContinueInConversations}
              className="group mt-3 cursor-pointer font-display text-[14px] text-sky-deep/62 transition-colors hover:text-sky-deep/82"
            >
              Keep reading
              <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">→</span>
            </button>
          )}
        </div>
      )}

      {typing && (
        <div className="mt-4 flex -translate-y-1 items-end justify-center gap-1" aria-label="Alice is responding">
          <span className="h-2.5 w-3 animate-bounce rounded-[55%_45%_52%_48%/48%_54%_46%_52%] bg-white/66 shadow-[0_3px_8px_-5px_rgba(50,100,150,0.8)] [animation-delay:-0.24s]" />
          <span className="h-3.5 w-4 animate-bounce rounded-[48%_52%_44%_56%/56%_46%_54%_44%] bg-white/78 shadow-[0_3px_8px_-5px_rgba(50,100,150,0.8)] [animation-delay:-0.12s]" />
          <span className="h-2.5 w-3 animate-bounce rounded-[52%_48%_58%_42%/44%_56%_46%_54%] bg-white/62 shadow-[0_3px_8px_-5px_rgba(50,100,150,0.8)]" />
        </div>
      )}
    </div>
  )
}
