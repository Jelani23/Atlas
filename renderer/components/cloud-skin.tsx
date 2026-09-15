"use client"

import type { ReactNode } from "react"

export type CloudAsset =
  | "nav"
  | "chat"
  | "panelWide"
  | "panelSquare"
  | "drawerWide"
  | "edgeTab"

const ASSETS: Record<CloudAsset, string> = {
  nav: "/ui/clouds/nav-shell.svg",
  chat: "/ui/clouds/chat-shell.svg",
  panelWide: "/ui/clouds/panel-wide.svg",
  panelSquare: "/ui/clouds/panel-square.svg",
  drawerWide: "/ui/clouds/drawer-wide.svg",
  edgeTab: "/ui/clouds/edge-tab.svg",
}

/*
 * These insets describe the calm interior of each illustrated shell, not just
 * generic component padding. Keeping them here means every caller shares the
 * same visual alignment when the artwork is tuned later.
 */
const SAFE_AREA: Record<CloudAsset, string> = {
  nav: "px-9 py-4 sm:px-11",
  chat: "px-8 py-4 sm:px-10",
  panelWide: "px-9 py-7 sm:px-10 sm:py-8",
  panelSquare: "p-3",
  drawerWide: "px-9 py-7 sm:px-12 sm:py-9",
  edgeTab: "px-2 py-3",
}

interface CloudSkinProps {
  asset: CloudAsset
  className?: string
  mirrorX?: boolean
}

export function CloudSkin({ asset, className = "", mirrorX = false }: CloudSkinProps) {
  return (
    <img
      src={ASSETS[asset]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`pointer-events-none absolute select-none object-fill ${mirrorX ? "-scale-x-100" : ""} ${className}`}
    />
  )
}

interface CloudSurfaceProps {
  asset: CloudAsset
  children: ReactNode
  className?: string
  contentClassName?: string
  skinClassName?: string
  mirrorX?: boolean
}

export function CloudSurface({
  asset,
  children,
  className = "",
  contentClassName = "",
  skinClassName = "",
  mirrorX = false,
}: CloudSurfaceProps) {
  return (
    <div className={`relative isolate ${className}`}>
      <CloudSkin
        asset={asset}
        mirrorX={mirrorX}
        className={`inset-0 h-full w-full ${skinClassName}`}
      />
      <div className={`relative z-10 ${SAFE_AREA[asset]} ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
