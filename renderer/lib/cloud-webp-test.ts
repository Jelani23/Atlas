import nav from "./cloud-webp-test/nav"
import chat from "./cloud-webp-test/chat"
import panelWide from "./cloud-webp-test/panel-wide"
import panelSquare from "./cloud-webp-test/panel-square"
import drawerWide from "./cloud-webp-test/drawer-wide"
import edgeTab from "./cloud-webp-test/edge-tab"

// Temporary A/B test artwork derived from the user's WebP cloud exports.
// The stable SVG asset set remains the default unless ?cloudSkin=webp is present.
export const CLOUD_WEBP_TEST_ASSETS = {
  nav,
  chat,
  panelWide,
  panelSquare,
  drawerWide,
  edgeTab,
} as const
