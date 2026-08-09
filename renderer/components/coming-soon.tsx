"use client"

import type { LucideIcon } from "lucide-react"

interface ComingSoonProps {
  icon: LucideIcon
  label: string
}

export function ComingSoon({ icon: Icon, label }: ComingSoonProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-display text-lg font-medium text-muted-foreground/80">{label}</p>
      <p className="max-w-xs text-sm text-muted-foreground/60">
        This part of Atlas is still being built.
      </p>
    </div>
  )
}
