"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { ArrowUp, Mic, Paperclip } from "lucide-react"

interface ChatInputProps {
  onSend: (text: string) => void
  listening: boolean
  onToggleMic: () => void
}

// How far the input is allowed to grow before it starts scrolling instead —
// a "reasonable limit" so a huge paste can't take over the screen.
const MAX_INPUT_HEIGHT_PX = 200

export function ChatInput({ onSend, listening, onToggleMic }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow: measure natural content height and expand up to the cap,
  // then let the textarea's own scrollbar take over beyond that.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text) return
    onSend(text)
    setValue("")
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // respect IME composition (CJK) and Safari's 229 quirk
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="group flex items-end gap-2 rounded-[1.75rem] border border-border/70 bg-card/70 p-2 pl-4 backdrop-blur-xl shadow-[0_12px_40px_-16px_rgba(80,130,190,0.45)] transition-colors focus-within:border-primary/50 focus-within:bg-card/90">
        <button
          type="button"
          className="mb-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Attach a file"
        >
          <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>

        <label htmlFor="alice-input" className="sr-only">
          Message Alice
        </label>
        <textarea
          ref={textareaRef}
          id="alice-input"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Alice anything…"
          className="themed-scroll flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          style={{ maxHeight: MAX_INPUT_HEIGHT_PX }}
        />

        <button
          type="button"
          onClick={onToggleMic}
          className={`relative mb-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
            listening
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
          aria-label={listening ? "Stop listening" : "Speak to Alice"}
          aria-pressed={listening}
        >
          {listening && (
            <>
              {/* rings emanating outward while the mic is live, staggered
                  so they read as one continuous pulse rather than three
                  separate ripples */}
              <span
                aria-hidden="true"
                className="animate-mic-wave pointer-events-none absolute inset-0 rounded-full border border-primary/60"
              />
              <span
                aria-hidden="true"
                className="animate-mic-wave pointer-events-none absolute inset-0 rounded-full border border-primary/60 [animation-delay:0.6s]"
              />
              <span
                aria-hidden="true"
                className="animate-mic-wave pointer-events-none absolute inset-0 rounded-full border border-primary/60 [animation-delay:1.2s]"
              />
            </>
          )}
          <Mic
            className={`h-[18px] w-[18px] ${listening ? "animate-pulse" : ""}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="submit"
          disabled={!value.trim()}
          className="mb-0.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
