"use client"

import { useEffect, useState } from "react"
import { Check, LoaderCircle, RefreshCw, Settings2, WifiOff, X } from "lucide-react"
import { AtlasApp } from "./atlas-app"
import {
  ensureAtlasBridge,
  getAtlasConnectionState,
  getAtlasRemoteOrigin,
  resetAtlasRemoteOrigin,
  retryAtlasConnection,
  setAtlasRemoteOrigin,
  subscribeAtlasConnection,
  type AtlasConnectionState,
} from "@/lib/web-atlas-bridge"

const STATUS_COPY: Record<AtlasConnectionState, { title: string; detail: string }> = {
  connecting: {
    title: "Connecting to Atlas…",
    detail: "Looking for your PC on the tailnet.",
  },
  initializing: {
    title: "Atlas is waking up…",
    detail: "The backend is reachable and still initializing.",
  },
  online: {
    title: "Atlas connected",
    detail: "Alice is available from this device.",
  },
  offline: {
    title: "Atlas is currently not active.",
    detail: "You can keep exploring the UI. Live AI features will reconnect automatically.",
  },
}

function ConnectionIndicator({ state }: { state: AtlasConnectionState }) {
  const [expanded, setExpanded] = useState(false)
  const [remoteOrigin, setRemoteOriginValue] = useState("")
  const copy = STATUS_COPY[state]
  const busy = state === "connecting" || state === "initializing"

  useEffect(() => {
    setRemoteOriginValue(getAtlasRemoteOrigin())
  }, [])

  if (state === "online" && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/45 bg-white/55 px-3 py-2 text-xs font-medium text-foreground/75 shadow-sm backdrop-blur-xl transition hover:bg-white/75"
        aria-label="Atlas connection settings"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-45" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Connected
      </button>
    )
  }

  return (
    <div className="pointer-events-auto w-[min(92vw,390px)] overflow-hidden rounded-[1.4rem] border border-white/50 bg-white/70 shadow-[0_16px_50px_-20px_rgba(45,90,145,0.55)] backdrop-blur-2xl">
      <div className="flex items-start gap-3 p-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/65 text-primary shadow-sm">
          {busy ? (
            <LoaderCircle className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
          ) : state === "offline" ? (
            <WifiOff className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Check className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy.detail}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {state === "offline" && (
            <button
              type="button"
              onClick={retryAtlasConnection}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/70 hover:text-foreground"
              aria-label="Retry Atlas connection"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/70 hover:text-foreground"
            aria-label={expanded ? "Close connection settings" : "Open connection settings"}
          >
            {expanded ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <form
          className="border-t border-border/45 bg-white/35 p-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            setAtlasRemoteOrigin(remoteOrigin)
            setRemoteOriginValue(getAtlasRemoteOrigin())
          }}
        >
          <label htmlFor="atlas-remote-origin" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Remote Atlas address
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="atlas-remote-origin"
              value={remoteOrigin}
              onChange={(event) => setRemoteOriginValue(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border/65 bg-white/60 px-3 py-2 text-xs text-foreground outline-none transition focus:border-primary/55 focus:bg-white/80"
              placeholder="https://desktop-name.tailnet.ts.net"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-105"
            >
              Connect
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Saved only on this device. Use the HTTPS Tailscale Serve address for an installed PWA.
            </p>
            <button
              type="button"
              onClick={() => {
                resetAtlasRemoteOrigin()
                setRemoteOriginValue(getAtlasRemoteOrigin())
              }}
              className="shrink-0 text-[10px] font-semibold text-primary hover:underline"
            >
              Reset
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export function AtlasRuntime() {
  const [connectionState, setConnectionState] = useState<AtlasConnectionState>(() => {
    // This happens before AtlasApp mounts, so its first bridge lookup sees the
    // native Electron bridge or the browser WebSocket adapter immediately.
    ensureAtlasBridge()
    return getAtlasConnectionState()
  })

  useEffect(() => subscribeAtlasConnection(setConnectionState), [])

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined)

    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })

    return () => window.removeEventListener("load", register)
  }, [])

  return (
    <div className="relative h-dvh overflow-hidden">
      <AtlasApp />
      <aside
        className="pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] z-[100]"
        aria-live="polite"
      >
        <ConnectionIndicator state={connectionState} />
      </aside>
    </div>
  )
}
