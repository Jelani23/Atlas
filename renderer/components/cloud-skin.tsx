"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { CLOUD_WEBP_TEST_ASSETS } from "@/lib/cloud-webp-test"

export type CloudAsset =
  | "nav"
  | "chat"
  | "panelWide"
  | "panelSquare"
  | "drawerWide"
  | "edgeTab"

type WebpCloudAsset =
  | CloudAsset
  | "atlasCloud"
  | "verticalPanel"
  | "thoughtsPanel"

const SVG_ASSETS: Record<CloudAsset, string> = {
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

// The v2 raster shells preserve the regenerated silhouettes, but at actual UI
// size their geometry change is intentionally subtle. These WebP-only optical
// fits make the roomier treatment visible without changing the stable SVG tab.
// Thoughts keeps the previous artwork and gets the slightly larger treatment the
// user preferred rather than being replaced with the vertical reserve asset.
const WEBP_FIT: Record<WebpCloudAsset, { scaleX: number; scaleY: number; translateY: number }> = {
  nav: { scaleX: 1.06, scaleY: 1.16, translateY: -4 },
  chat: { scaleX: 1.05, scaleY: 1.14, translateY: 0 },
  panelWide: { scaleX: 1.11, scaleY: 1.15, translateY: 0 },
  panelSquare: { scaleX: 1, scaleY: 1, translateY: 0 },
  drawerWide: { scaleX: 1.06, scaleY: 1.08, translateY: 0 },
  edgeTab: { scaleX: 1.06, scaleY: 1.1, translateY: 0 },
  atlasCloud: { scaleX: 1.07, scaleY: 1.09, translateY: 0 },
  verticalPanel: { scaleX: 1, scaleY: 1, translateY: 0 },
  thoughtsPanel: { scaleX: 1.18, scaleY: 1.2, translateY: 0 },
}

function useWebpCloudSkin() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      setEnabled(params.get("cloudSkin")?.toLowerCase() === "webp")
    }

    syncFromUrl()
    window.addEventListener("popstate", syncFromUrl)
    return () => window.removeEventListener("popstate", syncFromUrl)
  }, [])

  return enabled
}

interface CloudSkinProps {
  asset: CloudAsset
  webpAsset?: WebpCloudAsset
  className?: string
  mirrorX?: boolean
}

export function CloudSkin({ asset, webpAsset = asset, className = "", mirrorX = false }: CloudSkinProps) {
  const webpEnabled = useWebpCloudSkin()
  const [webpFailed, setWebpFailed] = useState(false)

  useEffect(() => {
    setWebpFailed(false)
  }, [asset, webpAsset, webpEnabled])

  const useWebp = webpEnabled && !webpFailed
  const src = useWebp ? CLOUD_WEBP_TEST_ASSETS[webpAsset] : SVG_ASSETS[asset]
  const fit = WEBP_FIT[webpAsset]
  const transform = useWebp
    ? `translate3d(0, ${fit.translateY}px, 0) scaleX(${(mirrorX ? -1 : 1) * fit.scaleX}) scaleY(${fit.scaleY})`
    : mirrorX
      ? "scaleX(-1)"
      : undefined

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => {
        if (webpEnabled) setWebpFailed(true)
      }}
      style={{ transform, transformOrigin: "center" }}
      className={`pointer-events-none absolute select-none object-fill ${className}`}
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

function webpAssetForSurface(asset: CloudAsset, style?: CSSProperties): WebpCloudAsset {
  const transitionName = (style as (CSSProperties & { viewTransitionName?: string }) | undefined)?.viewTransitionName

  if (asset === "panelWide" && transitionName === "atlas-host-status") {
    return "drawerWide"
  }

  if (asset === "panelWide" && transitionName === "atlas-cloud-status") {
    return "atlasCloud"
  }

  if (asset === "panelWide" && transitionName === "alice-thought-cloud") {
    return "thoughtsPanel"
  }

  return asset
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
        webpAsset={webpAssetForSurface(asset, style)}
        mirrorX={mirrorX}
        className={`inset-0 h-full w-full ${skinClassName}`}
      />
      <div className={`relative z-10 min-w-0 ${SAFE_AREA[asset]} ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
