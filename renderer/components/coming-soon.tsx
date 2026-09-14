"use client"

import { ListTodo, MonitorSmartphone, type LucideIcon } from "lucide-react"
import { CloudProjectsView } from "./cloud-projects-view"
import { DevicesView } from "./devices-view"
import { TasksView } from "./tasks-view"

interface ComingSoonProps {
  icon: LucideIcon
  label: string
}

const PLANNED_PAGE_OVERRIDES: Record<string, { icon: LucideIcon; label: string }> = {
  Memory: { icon: ListTodo, label: "Tasks" },
  Activity: { icon: MonitorSmartphone, label: "Connected Devices" },
}

export function ComingSoon({ icon, label }: ComingSoonProps) {
  if (label === "Projects") return <CloudProjectsView />
  if (label === "Memory") return <TasksView />
  if (label === "Activity") return <DevicesView />

  const plannedPage = PLANNED_PAGE_OVERRIDES[label]
  const Icon = plannedPage?.icon ?? icon
  const displayLabel = plannedPage?.label ?? label

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-display text-lg font-medium text-muted-foreground/80">{displayLabel}</p>
      <p className="max-w-xs text-sm text-muted-foreground/60">This part of Atlas is still being built.</p>
    </div>
  )
}
