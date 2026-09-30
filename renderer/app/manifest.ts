import type { MetadataRoute } from "next"

// The renderer is exported as a fully static site for Electron/PWA use.
// Next 16 requires metadata routes to opt into static generation when
// `output: "export"` is enabled.
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas OS — Alice",
    short_name: "Atlas",
    description: "Alice, your personal AI companion running on Atlas OS.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#dcecfb",
    theme_color: "#dcecfb",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
