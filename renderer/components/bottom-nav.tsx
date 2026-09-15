"use client"

import {
  FolderOpen,
  Home,
  ListTodo,
  MessagesSquare,
  MonitorSmartphone,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { CloudSkin } from "./cloud-skin"

export type AtlasTab = "home" | "conversations" | "projects" | "tasks" | "devices" | "settings"

interface NavItem {
  id: AtlasTab
  label: string
  icon: LucideIcon
}

const ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "devices", label: "Devices", icon: MonitorSmartphone },
  { id: "settings", label: "Settings", icon: Settings },
]

interface BottomNavProps {
  active: AtlasTab
  onChange: (id: AtlasTab) => void
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav aria-label="Primary" className="flex max-w-full justify-center px-4 py-2">
      <div className="relative isolate max-w-full">
        <CloudSkin
          asset="nav"
          className="-inset-x-5 -inset-y-4 h-[calc(100%+2rem)] w-[calc(100%+2.5rem)] opacity-78"
        />
        <div className="themed-scroll relative z-10 flex max-w-full items-center gap-0.5 overflow-x-auto px-2.5 py-1.5 sm:gap-1 sm:px-3">
          {ITEMS.map((item) => {
            const isActive = item.id === active
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
                className={`alice-nav-item flex shrink-0 cursor-pointer items-center gap-2 px-2.5 py-2 text-sm sm:px-3.5 ${
                  isActive
                    ? "bg-white/58 text-sky-deep shadow-[0_6px_16px_-12px_rgba(45,90,145,0.7)]"
                    : "text-foreground/58 hover:bg-white/28 hover:text-foreground/85"
                }`}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
                <span className="hidden font-display text-[15px] leading-none tracking-[0.01em] sm:inline">
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
