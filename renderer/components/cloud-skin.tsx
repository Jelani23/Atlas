"use client"

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
