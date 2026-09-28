const CACHE_NAME = 'green-felt-shell-v1'
const APP_SHELL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.add(APP_SHELL)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('green-felt-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_ASSETS' || !Array.isArray(event.data.assets)) return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await Promise.all(event.data.assets.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: 'same-origin' })
        if (response.ok) await cache.put(url, response)
      } catch { /* The current online shell remains available if optional assets fail. */ }
    }))
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(APP_SHELL, response.clone())
        }
        return response
      } catch {
        return (await caches.match(APP_SHELL)) || Response.error()
      }
    })())
    return
  }
  if (new URL(request.url).pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })())
  }
})
