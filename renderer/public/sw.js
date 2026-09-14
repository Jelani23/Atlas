const CACHE_NAME = "atlas-pwa-v2"
const CORE_ASSETS = ["/", "/icon.svg", "/apple-icon.png"]
const IS_LOCAL_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1"

self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEV) {
    self.skipWaiting()
    return
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("atlas-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(async () => {
        if (IS_LOCAL_DEV) {
          await caches.delete(CACHE_NAME)
          await self.registration.unregister()
          return
        }
        await self.clients.claim()
      }),
  )
})

self.addEventListener("fetch", (event) => {
  // Local Next development must always be controlled by Next/Turbopack itself.
  if (IS_LOCAL_DEV) return

  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/"))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
