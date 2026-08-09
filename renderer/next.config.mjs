/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron loads this as a static file tree (electron/main.js -> renderer/out),
  // so it needs to be a fully static export rather than a Node server build.
  output: 'export',
  distDir: 'out',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
