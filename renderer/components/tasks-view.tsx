"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, PauseCircle, PlayCircle } from "lucide-react"
import { listCloudTasks, type CloudProjectTask } from "@/lib/atlas-cloud"

const STATUS_META: Record<CloudProjectTask["status"], { label: string; icon: typeof PlayCircle; className: string }> = {
  "in-progress": { label: "In Progress", icon: PlayCircle, className: "text-primary bg-primary/10" },
  waiting: { label: "Waiting", icon: PauseCircle, className: "text-amber-700 bg-amber-400/15" },
  planned: { label: "Planned", icon: Clock3, className: "text-muted-foreground bg-secondary" },
  completed: { label: "Completed", icon: CheckCircle2, className: "text-emerald-700 bg-emerald-500/10" },
  failed: { label: "Failed", icon: AlertTriangle, className: "text-destructive bg-destructive/10" },
  interrupted: { label: "Interrupted", icon: PauseCircle, className: "text-amber-700 bg-amber-400/15" },
}

export function TasksView() {
  const [tasks, setTasks] = useState<CloudProjectTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await listCloudTasks()
        if (!cancelled) {
          setTasks(next)
          setError(null)
        }
      } catch {
        if (!cancelled) setError("Unlock Atlas cloud to see shared task state.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const groups = useMemo(() => {
    const active = tasks.filter((task) => ["in-progress", "waiting", "interrupted"].includes(task.status))
    const planned = tasks.filter((task) => task.status === "planned")
    const completed = tasks.filter((task) => ["completed", "failed"].includes(task.status))
    return [
      { label: "Active", tasks: active },
      { label: "Queued", tasks: planned },
      { label: "Recent", tasks: completed },
    ]
  }, [tasks])

  return (
    <div className="themed-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">Persistent work state</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">Tasks</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Task progress lives in Atlas cloud, so you can inspect the last-known state even when the host PC or Alice is offline.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading tasks…</div>
        )}
        {error && !loading && <p className="rounded-2xl border border-border/50 bg-white/45 p-4 text-sm text-muted-foreground">{error}</p>}

        {!loading && !error && (
          <div className="grid gap-4 xl:grid-cols-3">
            {groups.map((group) => (
              <section key={group.label} className="rounded-[1.5rem] border border-white/55 bg-white/55 p-5 shadow-[0_16px_45px_-32px_rgba(45,90,145,0.55)] backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-foreground">{group.label}</h2>
                  <span className="rounded-full bg-white/55 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{group.tasks.length}</span>
                </div>
                <div className="space-y-3">
                  {group.tasks.length === 0 && <p className="text-xs text-muted-foreground/70">Nothing here right now.</p>}
                  {group.tasks.map((task) => {
                    const meta = STATUS_META[task.status]
                    const Icon = meta.icon
                    return (
                      <div key={task.id} className="rounded-2xl border border-border/45 bg-white/42 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground/90">{task.title}</p>
                            {task.projectId && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary/65">{task.projectId}</p>}
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold ${meta.className}`}>
                            <Icon className="h-3 w-3" /> {meta.label}
                          </span>
                        </div>
                        {task.detail && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{task.detail}</p>}
                        {task.stage && <p className="mt-2 text-[10px] font-medium text-foreground/65">Current step: {task.stage}</p>}
                        {typeof task.progress === "number" && (
                          <div className="mt-3">
                            <div className="mb-1.5 flex justify-between text-[10px] font-medium text-muted-foreground"><span>Progress</span><span>{task.progress}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} /></div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
