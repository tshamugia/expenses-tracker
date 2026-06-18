/* ExtraTracker service worker — hand-written, no build step.
 *
 * Responsibilities:
 *  - Precache the offline fallback + core icons.
 *  - Network-first for navigations (fall back to /offline.html when offline).
 *  - Cache-first (stale-while-revalidate) for hashed static assets and icons.
 *  - Web Push: show notifications and route clicks.
 *
 * Safety: only GET, same-origin requests are intercepted. POST requests
 * (Server Actions) and /api/* are never touched, so auth and mutations are safe.
 */

const CACHE_VERSION = 'extracker-v1'
const PRECACHE_URLS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never interfere with non-GET (Server Actions, form posts) or cross-origin.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache API routes (auth, cron, dynamic data).
  if (url.pathname.startsWith('/api/')) return

  // Navigations: network-first, fall back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline.html').then((cached) => cached || Response.error())
      )
    )
    return
  }

  // Static assets: cache-first with background revalidation.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone()
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})

/* ---------------------------------------------------------------- Web Push */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'ExtraTracker', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'ExtraTracker'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/dashboard' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
