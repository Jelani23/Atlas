"use client"

import { useEffect, useState } from "react"
import { LoaderCircle, RefreshCw, Wifi, WifiOff, X } from "lucide-react"
import { runViewTransition, viewTransitionStyle } from "@/lib/view-transition"
import { getAtlasActiveTab, subscribeAtlasActiveTab } from "@/lib/active-tab"
import { AtlasApp } from "./atlas-app"
import { CloudSurface } from "./cloud-skin"
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

const TRANSITION_NAME = "atlas-host-status"

const CLOUD_TRANSITION_SNAPSHOT_FIX = `
::view-transition-old(alice-thought-cloud),
::view-transition-old(alice-recent-cloud),
::view-transition-old(atlas-cloud-status),
::view-transition-old(atlas-host-status) {
  opacity: 0 !important;
  animation: none !important;
}

::view-transition-new(alice-thought-cloud),
::view-transition-new(alice-recent-cloud),
::view-transition-new(atlas-cloud-status),
::view-transition-new(atlas-host-status) {
  opacity: 1 !important;
  animation: none !important;
  mix-blend-mode: normal !important;
}
`

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
      <CloudSurface
        asset="panelSquare"
        className="pointer-events-auto h-14 w-14 transition-transform hover:-translate-x-0.5"
        skinClassName="opacity-70"
        contentClassName="flex h-full items-center justify-center"
        style={viewTransitionStyle(TRANSITION_NAME)}
      >
        <button
          type="button"
          onClick={() => runViewTransition(() => setExpanded(true))}
          className="flex h-full w-full items-center justify-center text-sky-deep/70 active:scale-95"
          aria-label="Atlas host status"
          title={copy.title}
        >
          {busy ? (
            <LoaderCircle className="h-[18px] w-[18px] animate-spin" strokeWidth={1.8} aria-hidden="true" />
          ) : state === "online" ? (
            <Wifi className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <WifiOff className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          )}
        </button>
      </CloudSurface>
    )
  }

  return (
    <CloudSurface
      asset="panelWide"
      className="pointer-events-auto w-[min(94vw,460px)]"
      skinClassName="opacity-74"
      contentClassName="flex min-h-[15rem] items-center overflow-hidden"
      style={viewTransitionStyle(TRANSITION_NAME)}
    >
      <div className="mx-auto w-full max-w-[355px]">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-sky-deep/65">
            {busy ? (
              <LoaderCircle className="h-[17px] w-[17px] animate-spin" strokeWidth={1.8} aria-hidden="true" />
            ) : state === "online" ? (
              <Wifi className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <WifiOff className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] leading-tight text-foreground/78">{copy.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/46">{copy.detail}</p>
          </div>

          <button
            type="button"
            onClick={() => runViewTransition(() => setExpanded(false))}
            className="alice-icon-button flex h-6 w-6 shrink-0 items-center justify-center text-foreground/38 hover:bg-white/24 hover:text-foreground/65"
            aria-label="Collapse Atlas host status"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <form
          className="mt-3 border-t border-sky-deep/10 pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            setAtlasRemoteOrigin(remoteOrigin)
            setRemoteOriginValue(getAtlasRemoteOrigin())
            runViewTransition(() => setExpanded(false))
          }}
        >
          <label htmlFor="atlas-remote-origin" className="font-display text-[12px] text-foreground/55">Host address</label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              id="atlas-remote-origin"
              value={remoteOrigin}
              onChange={(event) => setRemoteOriginValue(event.target.value)}
              className="min-w-0 flex-1 rounded-[1rem_1.2rem_1.05rem_1.3rem] border border-white/52 bg-white/32 px-2.5 py-1.5 text-[11px] text-foreground outline-none transition focus:border-white/75 focus:bg-white/48"
              placeholder="https://desktop-name.tailnet.ts.net"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className="alice-nav-item shrink-0 bg-white/48 px-2.5 py-1.5 font-display text-[13px] text-sky-deep/80 transition hover:bg-white/68">Connect</button>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="min-w-0 text-[9px] leading-relaxed text-foreground/38">Saved only on this device.</p>
            <div className="flex shrink-0 items-center gap-2.5">
              {state === "offline" && (
                <button type="button" onClick={retryAtlasConnection} className="inline-flex items-center gap-1 font-display text-[12px] text-sky-deep/62 hover:text-sky-deep">
                  <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" /> Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetAtlasRemoteOrigin()
                  setRemoteOriginValue(getAtlasRemoteOrigin())
                }}
                className="font-display text-[12px] text-foreground/48 hover:text-foreground/70"
              >
                Reset
              </button>
            </div>
          </div>
        </form>
      </div>
    </CloudSurface>
  )
}

export function AtlasRuntime() {
  const [nativeDesktop] = useState(() => typeof window !== "undefined" && Boolean(window.windowControls))
  const [bridgeReady, setBridgeReady] = useState(false)
  const [connectionState, setConnectionState] = useState<AtlasConnectionState>("connecting")
  const [activeTab, setActiveTab] = useState(() => getAtlasActiveTab())

  useEffect(() => subscribeAtlasActiveTab(setActiveTab), [])

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
      <style>{CLOUD_TRANSITION_SNAPSHOT_FIX}</style>
      <AtlasApp key={bridgeReady ? "bridge-ready" : "bridge-booting"} hostConnectionState={connectionState} />
      {!nativeDesktop && activeTab === "home" && (
        <aside
          className="pointer-events-none fixed right-[max(0rem,env(safe-area-inset-right))] top-[max(6.4rem,calc(env(safe-area-inset-top)+5.8rem))] z-[100]"
          aria-live="polite"
        >
          <ConnectionIndicator state={connectionState} />
        </aside>
      )}
    </div>
  )
}
