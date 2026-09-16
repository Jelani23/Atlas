import panelWide from "./cloud-webp-test/panel-wide"
import panelSquare from "./cloud-webp-test/panel-square"
import edgeTab from "./cloud-webp-test/edge-tab"

// WebP A/B test artwork. The normal URL keeps the stable SVG skins.
// These v2 files are the user's regenerated, roomier cloud assets.
export const CLOUD_WEBP_TEST_ASSETS = {
  nav: "/ui/clouds/webp-test/nav-v2.webp",
  chat: "/ui/clouds/webp-test/chat-v2.webp",
  panelWide,
  panelSquare,
  drawerWide: "/ui/clouds/webp-test/atlas-host-v2.webp",
  edgeTab,
  atlasCloud: "/ui/clouds/webp-test/atlas-cloud-v2.webp",
  verticalPanel: "/ui/clouds/webp-test/vertical-v2.webp",
  thoughtsPanel: panelWide,
} as const
