"use client"

import { useEffect, useState } from "react"
import { Laptop, LoaderCircle, Monitor, Smartphone, Wifi, WifiOff } from "lucide-react"
import { listCloudDevices, type CloudDevice } from "@/lib/atlas-cloud"

function deviceIcon(device: CloudDevice) {
  if (device.type === "phone") return Smartphone
  if (device.role === "host") return Monitor
  return Laptop
}

function isFresh(device: CloudDevice) {
  const lastSeen = new Date(device.lastSeen).getTime()
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < 90_000 && device.status !== "offline"
}

function formatLastSeen(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return "Unknown"
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 45) return "Just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function DevicesView() {
  const [devices, setDevices] = useState<CloudDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await listCloudDevices()
        if (!cancelled) {
          setDevices(next)
          setError(null)
        }
      } catch {
        if (!cancelled) setError("Unlock Atlas cloud to see shared device state.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="themed-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">Presence & last-known state</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">Connected Devices</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Clients heartbeat into Atlas cloud. If a device disappears, its last activity remains visible instead of vanishing with the host.
          </p>
        </div>

        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading devices…</div>}
        {error && !loading && <p className="rounded-2xl border border-border/50 bg-white/45 p-4 text-sm text-muted-foreground">{error}</p>}

        {!loading && !error && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {devices.length === 0 && (
              <div className="rounded-[1.5rem] border border-white/55 bg-white/55 p-5 text-sm text-muted-foreground backdrop-blur-xl">
                No devices have registered yet. This device will appear after Atlas cloud is unlocked.
              </div>
            )}
            {devices.map((device) => {
              const Icon = deviceIcon(device)
              const online = isFresh(device)
              return (
                <article key={device.id} className="rounded-[1.6rem] border border-white/55 bg-white/55 p-5 shadow-[0_18px_50px_-30px_rgba(45,90,145,0.6)] backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm"><Icon className="h-5 w-5" /></span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${online ? "bg-emerald-500/10 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>
                      {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      {online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold text-foreground">{device.name}</h2>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">{device.platform || device.type}{device.role ? ` · ${device.role}` : ""}</p>

                  <div className="mt-5 space-y-3 text-xs">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">Current activity</p>
                      <p className="mt-1 text-foreground/80">{device.currentActivity || "Idle / unknown"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">Last seen</p>
                      <p className="mt-1 text-foreground/80">{formatLastSeen(device.lastSeen)}</p>
                    </div>
                    {device.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {device.capabilities.map((capability) => <span key={capability} className="rounded-full bg-white/55 px-2 py-1 text-[9px] font-medium text-muted-foreground">{capability}</span>)}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
