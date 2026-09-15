"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Cloud, CloudOff, KeyRound, LoaderCircle, LockKeyhole, LogOut, X } from "lucide-react"
import { CloudSurface } from "./cloud-skin"
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
  const [expanded, setExpanded] = useState(state === "locked")

  useEffect(() => {
    if (state === "locked") setExpanded(true)
    if (state === "online") setExpanded(false)
  }, [state])

  if (!expanded && state !== "locked") {
    return (
      <CloudSurface
        asset="edgeTab"
        mirrorX
        className="pointer-events-auto h-16 w-12 transition-transform hover:translate-x-0.5"
        skinClassName="opacity-76"
        contentClassName="flex h-full items-center justify-center"
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex h-full w-full items-center justify-center text-sky-deep/70 active:scale-95"
          aria-label="Atlas cloud status"
          title={state === "online" ? "Atlas cloud connected" : state === "offline" ? "Atlas cloud unavailable" : "Checking Atlas cloud"}
        >
          {state === "checking" ? (
            <LoaderCircle className="h-[17px] w-[17px] animate-spin" strokeWidth={1.8} aria-hidden="true" />
          ) : state === "online" ? (
            <Cloud className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <CloudOff className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          )}
        </button>
      </CloudSurface>
    )
  }

  return (
    <CloudSurface
      asset="drawerWide"
      className="animate-alice-unfold pointer-events-auto w-[min(92vw,390px)]"
      skinClassName="opacity-78"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-sky-deep/65">
          {state === "checking" ? (
            <LoaderCircle className="h-[18px] w-[18px] animate-spin" strokeWidth={1.8} aria-hidden="true" />
          ) : state === "online" ? (
            <Cloud className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden="true" />
          ) : state === "locked" ? (
            <LockKeyhole className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <CloudOff className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] leading-tight text-foreground/78">
            {state === "online" ? "Atlas cloud" : state === "locked" ? "Unlock Atlas" : state === "offline" ? "Cloud unavailable" : "Finding your cloud…"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/46">
            {state === "online"
              ? "Your chats and shared Atlas state are available here."
              : state === "locked"
                ? "Enter your Atlas password to open your shared data on this device."
                : state === "offline"
                  ? "Cached data can still appear while the cloud is unreachable."
                  : "Checking for your persistent Atlas data."}
          </p>
        </div>

        {state !== "locked" && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="alice-icon-button flex h-7 w-7 shrink-0 items-center justify-center text-foreground/38 hover:bg-white/28 hover:text-foreground/65"
            aria-label="Collapse cloud status"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {state === "locked" && (
        <form
          className="mt-4 border-t border-sky-deep/10 pt-3.5"
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
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/35" strokeWidth={1.8} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Atlas password"
                autoComplete="current-password"
                className="w-full rounded-[1.15rem_1.35rem_1.2rem_1.45rem] border border-white/52 bg-white/38 py-2 pl-9 pr-3 text-xs text-foreground outline-none transition focus:border-white/75 focus:bg-white/56"
              />
            </div>
            <button
              type="submit"
              disabled={!password || submitting}
              className="alice-nav-item shrink-0 bg-white/58 px-3 py-2 font-display text-[14px] text-sky-deep/80 transition hover:bg-white/78 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Opening…" : "Open"}
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
        </form>
      )}

      {state === "offline" && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-sky-deep/10 pt-3">
          <p className="min-w-0 text-[10px] leading-relaxed text-foreground/42">Cloud access is separate from whether Alice is awake on the PC.</p>
          <button type="button" onClick={() => void refreshAtlasCloudState()} className="shrink-0 font-display text-[13px] text-sky-deep/64 transition hover:text-sky-deep">Try again</button>
        </div>
      )}

      {state === "online" && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-sky-deep/10 pt-3">
          <p className="min-w-0 text-[10px] leading-relaxed text-foreground/42">This device stays unlocked until you lock it.</p>
          <button
            type="button"
            onClick={async () => {
              await lockAtlasCloud()
              setExpanded(true)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 font-display text-[13px] text-foreground/52 transition hover:text-foreground/75"
          >
            <LogOut className="h-3 w-3" aria-hidden="true" /> Lock
          </button>
        </div>
      )}
    </CloudSurface>
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
        className="pointer-events-none fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] left-[max(0rem,env(safe-area-inset-left))] z-[110]"
        aria-live="polite"
      >
        <CloudStatusCard state={state} />
      </aside>
    </div>
  )
}
