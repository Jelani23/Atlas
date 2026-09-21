import nav from "./cloud-webp-test/nav-v3"
import chat from "./cloud-webp-test/chat-v3"
import host from "./cloud-webp-test/host-v3"
import atlasCloud from "./cloud-webp-test/cloud-v3"
import panelWide from "./cloud-webp-test/panel-wide"
import panelSquare from "./cloud-webp-test/panel-square"
import edgeTab from "./cloud-webp-test/edge-tab"

// WebP A/B test artwork. The normal URL keeps the stable SVG skins.
// Active v3 artwork is embedded as data URIs so the comparison does not depend
// on Next/public asset routing or stale browser paths. Thoughts intentionally
// keeps the earlier cloud artwork the user liked, with its own larger art box.
export const CLOUD_WEBP_TEST_ASSETS = {
  nav,
  chat,
  panelWide,
  panelSquare,
  drawerWide: atlasCloud,
  edgeTab,
  atlasCloud,
  verticalPanel: panelWide,
  thoughtsPanel: panelWide,
} as const
