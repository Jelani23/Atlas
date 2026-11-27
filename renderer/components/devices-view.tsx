"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Keyboard, Laptop, Mic, Monitor, RefreshCw, Smartphone, Volume2, Watch } from "lucide-react"
import type { DeviceInventory, DeviceRecord } from "@/lib/atlas-events"

export function useDeviceInventory() {
  const [inventory, setInventory] = useState<DeviceInventory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const busy = useRef(false)
  const mounted = useRef(false)
  const refresh = useCallback(async () => {
    if (busy.current) return
    const bridge = window.atlasBridge
    if (!bridge?.listDevices) {
      setError("Restart Atlas to load the device connection. Devices are available in the desktop app.")
      setLoading(false)
      return
    }
    busy.current = true
    setLoading(true)
    try {
      const next = await bridge.listDevices()
      if (mounted.current) { setInventory(next); setError(null) }
    } catch {
      if (mounted.current) setError("Can't reach Atlas right now. Device status may be out of date.")
    } finally {
      busy.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = setInterval(() => void refresh(), 10000)
    const unsubscribe = window.atlasBridge?.onEvent(event => {
      if (event.type !== "atlas.status") return
      if (event.payload.phase === "client_registered") void refresh()
      if (event.payload.phase === "client_connection" && event.payload.status !== "ready") {
        setError("Disconnected from Atlas. Reconnecting…")
      }
    })
    return () => { mounted.current = false; clearInterval(timer); unsubscribe?.() }
  }, [refresh])
  return { inventory, error, loading, refresh }
}

const OS_NAMES: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux", ios: "iOS", android: "Android", watchos: "watchOS", unknown: "Unknown OS" }
const CAPABILITIES = [
  { key: "textInput", label: "Conversation", icon: Keyboard },
  { key: "audioPlayback", label: "Audio playback", icon: Volume2 },
  { key: "microphone", label: "Microphone", icon: Mic },
  { key: "screenshot", label: "Screen sharing", icon: Monitor },
  { key: "camera", label: "Camera", icon: Camera },
]

function permissionLabel(supported: boolean, permission: string) {
  if (!supported) return "Not supported"
  if (permission === "granted") return "Allowed"
  if (permission === "not-required") return "Available"
  if (permission === "denied" || permission === "restricted") return "Blocked"
  if (permission === "prompt" || permission === "not-determined") return "Needs permission"
  return "Permission not checked"
}

function DeviceCard({ device, stale }: { device: DeviceRecord; stale: boolean }) {
  const { client, screens } = device
  const Icon = client.deviceKind === "laptop" ? Laptop : client.deviceKind === "phone" || client.deviceKind === "tablet" ? Smartphone : client.deviceKind === "watch" ? Watch : Monitor
  const status = stale ? "Status unknown" : device.online ? "Online" : "Offline"
  return (
    <article className="px-5 py-5 md:px-6">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="break-words text-sm font-semibold">{client.displayName}</h2>
            {device.current && <span className="text-xs text-muted-foreground">This device</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{OS_NAMES[client.os] || client.os} · <span className="capitalize">{client.deviceKind}</span></p>
        </div>
        <span className="mt-1 flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${!stale && device.online ? "bg-emerald-600" : "bg-muted-foreground/50"}`} />{status}</span>
      </div>
      {!device.online && <p className="mt-2 pl-8 text-xs text-muted-foreground">Last seen {new Date(device.lastSeen).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
      <div className="mt-4 space-y-3 pl-8">
        {screens?.displays.map(display => <div key={display.id} className="flex items-start gap-2.5 text-xs">
          <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div><p>{display.label}</p><p className="mt-1 text-muted-foreground">{display.width} × {display.height} · {display.scaleFactor}× scale{display.rotation ? ` · ${display.rotation}°` : ""}{display.primary ? " · Primary" : ""}{display.current ? " · Atlas window" : ""}</p></div>
        </div>)}
        {!screens && <p className="text-xs text-muted-foreground">Display information unavailable.</p>}
        {screens && !screens.displays.length && <p className="text-xs text-muted-foreground">No connected displays reported.</p>}
        {screens && (!device.online || stale) && <p className="text-xs text-muted-foreground">Displays last reported {new Date(screens.observedAt).toLocaleString()}</p>}
        <details className="pt-1">
          <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2">Capabilities & device details</summary>
          <dl className="mt-3 max-w-lg space-y-2">
            {CAPABILITIES.map(({ key, label, icon: CapabilityIcon }) => {
              const capability = client.capabilities[key]
              const permission = key === "screenshot" && screens ? screens.permission : capability?.permission || "unknown"
              return <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <dt className="flex items-center gap-2"><CapabilityIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{label}</dt>
                <dd className="text-muted-foreground">{permissionLabel(capability?.supported === true, permission)}</dd>
              </div>
            })}
            <div className="flex justify-between gap-2 pt-2 text-xs"><dt>Client</dt><dd className="capitalize text-muted-foreground">{client.clientType}</dd></div>
            <div className="text-xs"><dt>Device ID</dt><dd className="mt-1 break-all font-mono text-muted-foreground">{client.deviceId}</dd></div>
          </dl>
        </details>
      </div>
    </article>
  )
}

export function DevicesView({ inventory, error, loading, refresh }: ReturnType<typeof useDeviceInventory>) {
  const devices = [...(inventory?.devices || [])].sort((a, b) => Number(b.current) - Number(a.current) || Number(b.online) - Number(a.online) || a.client.displayName.localeCompare(b.client.displayName))
  return (
    <section aria-labelledby="devices-heading" className="themed-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8 md:px-10">
      <div className="mx-auto max-w-3xl pt-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 id="devices-heading" className="font-display text-lg font-semibold">Devices</h1>
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh devices" title="Refresh devices" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" /></button>
        </div>
        {error && <p role="status" className="mb-4 text-sm text-muted-foreground">{error}</p>}
        <div className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60 bg-card/40 backdrop-blur-md">
          {devices.map(device => <DeviceCard key={device.client.deviceId} device={device} stale={!!error} />)}
          {!devices.length && <p className="px-6 py-10 text-center text-sm text-muted-foreground">{loading ? "Loading devices…" : error ? "Devices will appear when Atlas reconnects." : "No devices connected. Open Atlas on another computer using the same backend to connect it."}</p>}
        </div>
        {devices.length > 0 && <p className="mt-3 px-1 text-xs text-muted-foreground">Previously connected devices stay listed when offline.</p>}
      </div>
    </section>
  )
}
