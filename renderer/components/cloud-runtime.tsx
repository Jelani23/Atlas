"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, CloudOff, KeyRound, LoaderCircle, LockKeyhole, LogOut } from "lucide-react"
import {
  getAtlasCloudState,
  initializeAtlasCloud,
  lockAtlasCloud,
  refreshAtlasCloudState,
  subscribeAtlasCloud,
  unlockAtlasCloud,
  type AtlasCloudState,
} from "@/lib/atlas-cloud"

function CloudStatusCard({ state }: { state: AtlasCloudState }) {
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(state !== "online")

  useEffect(() => {
    if (state !== "online") setExpanded(true)
  }, [state])

  if (state === "online" && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/45 bg-white/55 px-3 py-2 text-xs font-medium text-foreground/75 shadow-sm backdrop-blur-xl transition hover:bg-white/75"
        aria-label="Atlas cloud settings"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-35" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
        </span>
        Cloud
      </button>
    )
  }

  return (
    <div className="pointer-events-auto w-[min(92vw,390px)] overflow-hidden rounded-[1.4rem] border border-white/50 bg-white/72 shadow-[0_16px_50px_-20px_rgba(45,90,145,0.5)] backdrop-blur-2xl">
      <div className="flex items-start gap-3 p-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/65 text-primary shadow-sm">
          {state === "checking" ? (
            <LoaderCircle className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
          ) : state === "online" ? (
            <Check className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : state === "locked" ? (
            <LockKeyhole className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <CloudOff className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {state === "online"
              ? "Atlas cloud connected"
              : state === "locked"
                ? "Unlock Atlas"
                : state === "offline"
                  ? "Atlas cloud unavailable"
                  : "Checking Atlas cloud…"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {state === "online"
              ? "Chats, projects, tasks, and device state are available on this device."
              : state === "locked"
                ? "Enter your Atlas password to access shared cloud data."
                : state === "offline"
                  ? "Last-known cloud data can still be used where it has been cached."
                  : "Looking for your persistent Atlas data."}
          </p>
        </div>

        {state === "online" && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-full px-2 py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-white/65 hover:text-foreground"
          >
            {expanded ? "Hide" : "Manage"}
          </button>
        )}
      </div>

      {expanded && state === "locked" && (
        <form
          className="border-t border-border/45 bg-white/35 p-3.5"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!password || submitting) return
            setSubmitting(true)
            setError(null)
            const result = await unlockAtlasCloud(password)
            setSubmitting(false)
            if (!result.ok) {
              setError("That password did not unlock Atlas.")
              return
            }
            setPassword("")
            setExpanded(false)
            window.location.reload()
          }}
        >
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Atlas password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-border/65 bg-white/65 py-2 pl-9 pr-3 text-xs text-foreground outline-none transition focus:border-primary/55 focus:bg-white/85"
              />
            </div>
            <button
              type="submit"
              disabled={!password || submitting}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Unlocking…" : "Unlock"}
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Atlas uses one private owner identity behind the scenes; there is no account switching in the app.
          </p>
        </form>
      )}

      {expanded && state === "offline" && (
        <div className="flex items-center justify-between gap-3 border-t border-border/45 bg-white/35 p-3.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground">Cloud state is separate from whether Alice is running on the host PC.</p>
          <button
            type="button"
            onClick={() => void refreshAtlasCloudState()}
            className="shrink-0 rounded-full bg-white/65 px-3 py-1.5 text-[10px] font-semibold text-primary"
          >
            Retry
          </button>
        </div>
      )}

      {expanded && state === "online" && (
        <div className="flex items-center justify-between gap-3 border-t border-border/45 bg-white/35 p-3.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground">This device keeps a persistent Supabase session until you lock Atlas.</p>
          <button
            type="button"
            onClick={async () => {
              await lockAtlasCloud()
              setExpanded(true)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/65 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <LogOut className="h-3 w-3" aria-hidden="true" />
            Lock
          </button>
        </div>
      )}
    </div>
  )
}

export function CloudRuntime({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AtlasCloudState>(() => getAtlasCloudState())

  useEffect(() => {
    const unsubscribe = subscribeAtlasCloud(setState)
    void initializeAtlasCloud()
    return unsubscribe
  }, [])

  return (
    <div className="relative h-dvh overflow-hidden">
      {children}
      <aside
        className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-[110]"
        aria-live="polite"
      >
        <CloudStatusCard state={state} />
      </aside>
    </div>
  )
}
