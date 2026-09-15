"use client"

import type { CSSProperties, ReactNode } from "react"

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

// These are deliberately conservative "safe interiors". The visible cloud rim,
// lobes and glossy highlights all live outside this zone, so interactive content
// never has to fight the artwork for space.
const SAFE_AREA: Record<CloudAsset, string> = {
  nav: "px-12 py-6 sm:px-14 sm:py-6",
  chat: "px-11 py-5 sm:px-14 sm:py-5",
  panelWide: "px-11 py-8 sm:px-12 sm:py-9",
  panelSquare: "p-3",
  drawerWide: "px-11 py-8 sm:px-12 sm:py-9",
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
  style?: CSSProperties
}

export function CloudSurface({
  asset,
  children,
  className = "",
  contentClassName = "",
  skinClassName = "",
  mirrorX = false,
  style,
}: CloudSurfaceProps) {
  return (
    <div className={`relative isolate min-w-0 ${className}`} style={style}>
      <CloudSkin
        asset={asset}
        mirrorX={mirrorX}
        className={`inset-0 h-full w-full ${skinClassName}`}
      />
      <div className={`relative z-10 min-w-0 ${SAFE_AREA[asset]} ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
