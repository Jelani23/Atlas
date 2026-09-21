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

interface SkinBox {
  width: string
  height: string
  left: string
  top: string
}

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

const DEFAULT_SKIN_BOX: SkinBox = {
  width: "100%",
  height: "100%",
  left: "0%",
  top: "0%",
}

// Raster artwork needs its own optical box instead of being forced into the
// exact SVG surface bounds. Content stays fixed; only the WebP artwork expands
// around it. This keeps the A/B comparison honest and prevents us from making
// the actual controls larger just to accommodate a cloud silhouette.
const WEBP_SKIN_BOX: Record<WebpCloudAsset, SkinBox> = {
  nav: { width: "112%", height: "132%", left: "-6%", top: "-18%" },
  chat: { width: "108%", height: "134%", left: "-2%", top: "-17%" },
  panelWide: { width: "108%", height: "110%", left: "-4%", top: "-5%" },
  panelSquare: DEFAULT_SKIN_BOX,
  drawerWide: { width: "110%", height: "116%", left: "-5%", top: "-8%" },
  edgeTab: { width: "106%", height: "110%", left: "-3%", top: "-5%" },
  atlasCloud: { width: "112%", height: "118%", left: "-6%", top: "-9%" },
  verticalPanel: DEFAULT_SKIN_BOX,
  thoughtsPanel: { width: "114%", height: "116%", left: "-7%", top: "-8%" },
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
  const box = useWebp ? WEBP_SKIN_BOX[webpAsset] : DEFAULT_SKIN_BOX

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => {
        if (webpEnabled) setWebpFailed(true)
      }}
      style={{
        width: box.width,
        height: box.height,
        left: box.left,
        top: box.top,
        transform: mirrorX ? "scaleX(-1)" : undefined,
        transformOrigin: "center",
      }}
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
        className={skinClassName}
      />
      <div className={`relative z-10 min-w-0 ${SAFE_AREA[asset]} ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
