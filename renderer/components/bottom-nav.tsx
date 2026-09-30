"use client"

import { useLayoutEffect, useRef, useState } from "react"
import {
  FolderOpen,
  Home,
  ListTodo,
  MessagesSquare,
  MonitorSmartphone,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { CloudSurface } from "./cloud-skin"

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

interface NavIndicatorState {
  left: number
  width: number
  ready: boolean
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<NavIndicatorState>({ left: 0, width: 0, ready: false })

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    const measure = () => {
      const activeButton = track.querySelector<HTMLButtonElement>(`button[data-atlas-tab="${active}"]`)
      if (!activeButton) return

      const next = {
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
        ready: true,
      }

      setIndicator((current) =>
        current.left === next.left && current.width === next.width && current.ready
          ? current
          : next,
      )
    }

    measure()

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    observer?.observe(track)
    track.querySelectorAll("button[data-atlas-tab]").forEach((button) => observer?.observe(button))
    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [active])

  return (
    <nav aria-label="Primary" className="flex max-w-full justify-center px-2 py-1 sm:px-4 sm:py-2">
      <CloudSurface
        asset="nav"
        className="max-w-full"
        skinClassName="opacity-80"
        contentClassName="flex min-h-[6.75rem] items-center overflow-hidden"
      >
        <div className="themed-scroll w-full max-w-full overflow-x-auto">
          <div ref={trackRef} className="relative flex w-max items-center gap-0.5 sm:gap-1">
            <span
              aria-hidden="true"
              className={`alice-nav-indicator absolute inset-y-0.5 left-0 ${indicator.ready ? "opacity-100" : "opacity-0"}`}
              style={{
                width: `${indicator.width}px`,
                transform: `translate3d(${indicator.left}px, 0, 0)`,
              }}
            />

            {ITEMS.map((item) => {
              const isActive = item.id === active
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  data-atlas-tab={item.id}
                  onClick={() => onChange(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={`alice-nav-item relative z-10 flex shrink-0 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm sm:px-3.5 ${
                    isActive
                      ? "text-sky-deep"
                      : "text-foreground/58 hover:bg-white/18 hover:text-foreground/85"
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
      </CloudSurface>
    </nav>
  )
}
