"use client"

import {
  Activity,
  FolderOpen,
  Home,
  MessagesSquare,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

const ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "conversation", label: "Conversation", icon: MessagesSquare },
  { id: "memory", label: "Memory", icon: Sparkles },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
]

interface BottomNavProps {
  active: string
  onChange: (id: string) => void
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav aria-label="Primary" className="flex justify-center">
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1.5 backdrop-blur-xl shadow-[0_12px_40px_-18px_rgba(80,130,190,0.5)]">
        {ITEMS.map((item) => {
          const isActive = item.id === active
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span
                className={isActive ? "inline" : "hidden sm:inline"}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
