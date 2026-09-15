"use client"

export type CloudAsset =
  | "nav"
  | "chat"
  | "panelWide"
  | "panelSquare"
  | "drawerWide"
  | "drawerTall"
  | "edgeTab"

const ASSETS: Record<CloudAsset, string> = {
  nav: "/ui/clouds/nav-shell.webp",
  chat: "/ui/clouds/chat-shell.webp",
  panelWide: "/ui/clouds/panel-wide.webp",
  panelSquare: "/ui/clouds/panel-square.webp",
  drawerWide: "/ui/clouds/drawer-wide.webp",
  drawerTall: "/ui/clouds/drawer-tall.webp",
  edgeTab: "/ui/clouds/edge-tab.webp",
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
