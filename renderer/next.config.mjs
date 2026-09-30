import { fileURLToPath } from 'node:url'

const rendererRoot = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron loads this as a static file tree (electron/main.js -> renderer/out),
  // so it needs to be a fully static export rather than a Node server build.
  output: 'export',
  distDir: 'out',
  turbopack: {
    // Atlas has lockfiles at both the repo root and renderer level. Pinning
    // Turbopack here prevents Next from guessing the wrong workspace root.
    root: rendererRoot,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
