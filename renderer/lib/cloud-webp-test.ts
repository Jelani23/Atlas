import nav from "./cloud-webp-test/nav"
import panelWide from "./cloud-webp-test/panel-wide"
import panelSquare from "./cloud-webp-test/panel-square"
import drawerWide from "./cloud-webp-test/drawer-wide"
import edgeTab from "./cloud-webp-test/edge-tab"

// Temporary A/B test artwork derived from the user's WebP cloud exports.
// The stable SVG asset set remains the default unless ?cloudSkin=webp is present.
// For this pass the chat bar intentionally reuses the alternate long cloud (nav)
// so it can be compared against the original chat-specific long asset.
export const CLOUD_WEBP_TEST_ASSETS = {
  nav,
  chat: nav,
  panelWide,
  panelSquare,
  drawerWide,
  edgeTab,
} as const
