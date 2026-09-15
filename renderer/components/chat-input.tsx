"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { ArrowUp, Mic, Paperclip } from "lucide-react"
import { CloudSurface } from "./cloud-skin"

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
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" aria-disabled={disabled}>
      <CloudSurface
        asset="chat"
        className="w-full"
        skinClassName={`transition-opacity duration-300 ${disabled ? "opacity-48" : "opacity-82"}`}
        contentClassName="flex items-end gap-2"
      >
        <button
          type="button"
          disabled={disabled}
          className="alice-icon-button mb-1 flex h-9 w-9 shrink-0 items-center justify-center text-foreground/45 enabled:cursor-pointer enabled:hover:bg-white/35 enabled:hover:text-foreground/75 disabled:cursor-not-allowed disabled:opacity-25"
          aria-label="Attach a file"
        >
          <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
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
          placeholder={disabled ? disabledPlaceholder : "Talk to Alice…"}
          className="themed-scroll min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/38 focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
          style={{ maxHeight: MAX_INPUT_HEIGHT_PX }}
        />

        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          className={`alice-icon-button relative mb-1 flex h-9 w-9 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-25 ${
            listening
              ? "bg-white/52 text-sky-deep"
              : "text-foreground/45 enabled:cursor-pointer enabled:hover:bg-white/35 enabled:hover:text-foreground/75"
          }`}
          aria-label={listening ? "Stop listening" : "Speak to Alice"}
          aria-pressed={listening}
        >
          {listening && !disabled && (
            <>
              <span aria-hidden="true" className="animate-mic-wave pointer-events-none absolute inset-0 rounded-full border border-primary/45" />
              <span aria-hidden="true" className="animate-mic-wave pointer-events-none absolute inset-0 rounded-full border border-primary/45 [animation-delay:0.6s]" />
              <span aria-hidden="true" className="animate-mic-wave pointer-events-none absolute inset-0 rounded-full border border-primary/45 [animation-delay:1.2s]" />
            </>
          )}
          <Mic className={`h-[18px] w-[18px] ${listening && !disabled ? "animate-pulse" : ""}`} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="alice-icon-button mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center bg-white/70 text-sky-deep shadow-[0_6px_14px_-10px_rgba(36,91,145,0.9)] enabled:cursor-pointer enabled:hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-25"
          aria-label="Send message"
        >
          <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        </button>
      </CloudSurface>
    </form>
  )
}
