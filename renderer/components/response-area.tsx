"use client"

export interface Message {
  id: string
  role: "atlas" | "user"
  text: string
}

interface ResponseAreaProps {
  messages: Message[]
  typing: boolean
}

export function ResponseArea({ messages, typing }: ResponseAreaProps) {
  const latest = messages[messages.length - 1]

  return (
    <div className="mx-auto w-full max-w-2xl px-2 text-center">
      {!latest && !typing && (
        <p className="font-display text-lg font-medium text-muted-foreground/80 text-balance">
          {"Hi, I'm Alice."}
          <span className="mt-1 block text-sm font-normal text-muted-foreground/60">
            A calm presence, here whenever you need me.
          </span>
        </p>
      )}

      {latest && (
        <div key={latest.id} className="animate-rise">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">
            {latest.role === "atlas" ? "Alice" : "You"}
          </p>
          <p
            className={`text-pretty leading-relaxed ${
              latest.role === "atlas"
                ? "font-display text-xl font-medium text-foreground md:text-2xl"
                : "text-base text-muted-foreground"
            }`}
          >
            {latest.text}
          </p>
        </div>
      )}

      {typing && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.2s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.1s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" />
        </div>
      )}
    </div>
  )
}
