"use client"

import { Fragment, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { ArrowUp, Mic, Paperclip } from "lucide-react"
import { CloudSurface } from "./cloud-skin"

interface ChatInputProps {
  onSend: (text: string) => void
  listening: boolean
  onToggleMic: () => void
  disabled?: boolean
  disabledPlaceholder?: string
  embedded?: boolean
}

const MAX_INPUT_HEIGHT_PX = 200

export function ChatInput({
  onSend,
  listening,
  onToggleMic,
  disabled = false,
  disabledPlaceholder = "Alice is unavailable while the ATLAS host is offline",
  embedded = false,
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

  const controls = (
    <Fragment>
      <button
        type="button"
        disabled={disabled}
        className="alice-icon-button flex h-8 w-8 shrink-0 items-center justify-center text-foreground/45 enabled:cursor-pointer enabled:hover:bg-white/28 enabled:hover:text-foreground/75 disabled:cursor-not-allowed disabled:opacity-25"
        aria-label="Attach a file"
      >
        <Paperclip className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
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
        className="themed-scroll min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/38 focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
        style={{ maxHeight: MAX_INPUT_HEIGHT_PX }}
      />

      <button
        type="button"
        onClick={onToggleMic}
        disabled={disabled}
        className={`alice-icon-button relative flex h-8 w-8 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-25 ${
          listening
            ? "bg-white/42 text-sky-deep"
            : "text-foreground/45 enabled:cursor-pointer enabled:hover:bg-white/28 enabled:hover:text-foreground/75"
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
        <Mic className={`h-[17px] w-[17px] ${listening && !disabled ? "animate-pulse" : ""}`} strokeWidth={1.8} aria-hidden="true" />
      </button>

      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="alice-icon-button flex h-9 w-9 shrink-0 items-center justify-center bg-white/58 text-sky-deep shadow-[0_5px_12px_-10px_rgba(36,91,145,0.8)] enabled:cursor-pointer enabled:hover:bg-white/76 disabled:cursor-not-allowed disabled:opacity-25"
        aria-label="Send message"
      >
        <ArrowUp className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
      </button>
    </Fragment>
  )

  return (
    <form onSubmit={handleSubmit} className="w-full" aria-disabled={disabled}>
      {embedded ? (
        <div className={`flex min-h-[4.5rem] w-full items-center gap-2 rounded-[1.4rem_1.75rem_1.5rem_1.85rem] border border-white/45 bg-white/26 px-4 backdrop-blur-sm transition-colors focus-within:bg-white/38 ${disabled ? "opacity-55" : ""}`}>
          {controls}
        </div>
      ) : (
        <CloudSurface
          asset="chat"
          className="w-full"
          skinClassName={`transition-opacity duration-300 ${disabled ? "opacity-48" : "opacity-84"}`}
          contentClassName="flex min-h-[5.75rem] items-center gap-2 overflow-hidden translate-y-[2px]"
        >
          {controls}
        </CloudSurface>
      )}
    </form>
  )
}
