"use client"

import { useEffect, useState } from "react"
import { LoaderCircle, RefreshCw, Wifi, WifiOff, X } from "lucide-react"
import { AtlasApp } from "./atlas-app"
import { CloudSkin } from "./cloud-skin"
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
  connecting: { title: "Finding Alice…", detail: "Looking for the ATLAS host on your tailnet." },
  initializing: { title: "Alice is waking up…", detail: "The host is reachable and ATLAS is still starting." },
  online: { title: "Alice is here", detail: "The ATLAS host is connected and live features are available." },
  offline: { title: "Alice is offline", detail: "The host is not reachable right now. Your saved Atlas data is still available." },
}

function ConnectionIndicator({ state }: { state: AtlasConnectionState }) {
  const [expanded, setExpanded] = useState(false)
  const [remoteOrigin, setRemoteOriginValue] = useState("")
  const copy = STATUS_COPY[state]
  const busy = state === "connecting" || state === "initializing"

  useEffect(() => {
    setRemoteOriginValue(getAtlasRemoteOrigin())
  }, [])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="pointer-events-auto relative isolate -mr-0.5 flex h-16 w-11 items-center justify-center text-sky-deep/70 transition-transform hover:-translate-x-0.5 active:translate-x-0 active:scale-95"
        aria-label="Atlas host status"
        title={copy.title}
      >
        <CloudSkin asset="edgeTab" className="-bottom-2 -left-7 -right-0 -top-2 h-[calc(100%+1rem)] w-[calc(100%+1.75rem)] opacity-80" />
        {busy ? (
          <LoaderCircle className="relative z-10 h-[18px] w-[18px] animate-spin" strokeWidth={1.8} aria-hidden="true" />
        ) : state === "online" ? (
          <Wifi className="relative z-10 h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <WifiOff className="relative z-10 h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
    )
  }

  return (
    <div className="animate-alice-unfold pointer-events-auto relative isolate w-[min(90vw,370px)]">
      <CloudSkin asset="drawerWide" className="-inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)] opacity-78" />
      <div className="relative z-10 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-sky-deep/65">
            {busy ? (
              <LoaderCircle className="h-[18px] w-[18px] animate-spin" strokeWidth={1.8} aria-hidden="true" />
            ) : state === "online" ? (
              <Wifi className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <WifiOff className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] leading-tight text-foreground/78">{copy.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/46">{copy.detail}</p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="alice-icon-button flex h-7 w-7 shrink-0 items-center justify-center text-foreground/38 hover:bg-white/28 hover:text-foreground/65"
            aria-label="Collapse Atlas host status"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <form
          className="mt-4 border-t border-sky-deep/10 pt-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            setAtlasRemoteOrigin(remoteOrigin)
            setRemoteOriginValue(getAtlasRemoteOrigin())
            setExpanded(false)
          }}
        >
          <label htmlFor="atlas-remote-origin" className="font-display text-[13px] text-foreground/55">Host address</label>
          <div className="mt-2 flex gap-2">
            <input
              id="atlas-remote-origin"
              value={remoteOrigin}
              onChange={(event) => setRemoteOriginValue(event.target.value)}
              className="min-w-0 flex-1 rounded-[1.15rem_1.35rem_1.2rem_1.45rem] border border-white/52 bg-white/38 px-3 py-2 text-xs text-foreground outline-none transition focus:border-white/75 focus:bg-white/56"
              placeholder="https://desktop-name.tailnet.ts.net"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className="alice-nav-item bg-white/58 px-3 py-2 font-display text-[14px] text-sky-deep/80 transition hover:bg-white/78">Connect</button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[10px] leading-relaxed text-foreground/38">Saved only on this device.</p>
            <div className="flex items-center gap-3">
              {state === "offline" && (
                <button type="button" onClick={retryAtlasConnection} className="inline-flex items-center gap-1 font-display text-[13px] text-sky-deep/62 hover:text-sky-deep">
                  <RefreshCw className="h-3 w-3" aria-hidden="true" /> Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetAtlasRemoteOrigin()
                  setRemoteOriginValue(getAtlasRemoteOrigin())
                }}
                className="font-display text-[13px] text-foreground/48 hover:text-foreground/70"
              >
                Reset
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AtlasRuntime() {
  const [nativeDesktop] = useState(() => typeof window !== "undefined" && Boolean(window.windowControls))
  const [bridgeReady, setBridgeReady] = useState(false)
  const [connectionState, setConnectionState] = useState<AtlasConnectionState>("connecting")

  useEffect(() => {
    ensureAtlasBridge()
    setConnectionState(getAtlasConnectionState())
    setBridgeReady(true)
    return subscribeAtlasConnection(setConnectionState)
  }, [])

  useEffect(() => {
    if (nativeDesktop || !("serviceWorker" in navigator)) return

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => void registration.unregister())
      })
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.filter((key) => key.startsWith("atlas-pwa-")).forEach((key) => void caches.delete(key))
        })
      }
      return
    }

    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [nativeDesktop])

  return (
    <div className="relative h-dvh overflow-hidden">
      <AtlasApp key={bridgeReady ? "bridge-ready" : "bridge-booting"} hostConnectionState={connectionState} />
      {!nativeDesktop && (
        <aside
          className="pointer-events-none fixed right-[max(0rem,env(safe-area-inset-right))] top-[max(4.8rem,calc(env(safe-area-inset-top)+4.2rem))] z-[100]"
          aria-live="polite"
        >
          <ConnectionIndicator state={connectionState} />
        </aside>
      )}
    </div>
  )
}
