"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { ArrowUp, Mic, Paperclip } from "lucide-react"

interface ChatInputProps {
  onSend: (text: string) => void
  listening: boolean
  onToggleMic: () => void
  disabled?: boolean
  disabledPlaceholder?: string
}

const MAX_INPUT_HEIGHT_PX = 200

export function ChatInput({
  onSend,
  listening,
  onToggleMic,
  disabled = false,
  disabledPlaceholder = "Alice is unavailable while the ATLAS host is offline",
}: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`
  }, [value])

  const submit = () => {
    if (disabled) return
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
    <form onSubmit={handleSubmit} className="w-full" aria-disabled={disabled}>
      <div
        className={`group flex items-end gap-2 rounded-[1.75rem] border p-2 pl-4 backdrop-blur-xl transition-colors ${
          disabled
            ? "border-border/35 bg-card/40 shadow-none"
            : "border-border/70 bg-card/70 shadow-[0_12px_40px_-16px_rgba(80,130,190,0.45)] focus-within:border-primary/50 focus-within:bg-card/90"
        }`}
      >
        <button
          type="button"
          disabled={disabled}
          className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors enabled:cursor-pointer enabled:hover:bg-secondary enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
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
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? disabledPlaceholder : "Ask Alice anything…"}
          className="themed-scroll flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
          style={{ maxHeight: MAX_INPUT_HEIGHT_PX }}
        />

        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          className={`relative mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
            listening
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground enabled:cursor-pointer enabled:hover:bg-secondary enabled:hover:text-foreground"
          }`}
          aria-label={listening ? "Stop listening" : "Speak to Alice"}
          aria-pressed={listening}
        >
          {listening && !disabled && (
            <>
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
            className={`h-[18px] w-[18px] ${listening && !disabled ? "animate-pulse" : ""}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all enabled:cursor-pointer enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send message"
        >
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
