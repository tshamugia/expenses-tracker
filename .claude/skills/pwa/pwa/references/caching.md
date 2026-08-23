# Caching Strategies

Pick a strategy **per class of request**. Applying one strategy to the whole app is the most common PWA mistake — it either serves stale data or kills offline support.

## The five strategies

### 1. Cache-first (for hashed static assets)
Serve from cache; only hit network on a miss. Perfect for content-hashed JS/CSS/fonts whose filenames change on every build.
```js
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
  return res;
}
```

### 2. Network-first (for HTML navigations / fresh data)
Try network; fall back to cache; fall back to offline page. Users get fresh content online, something usable offline.
```js
async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    return (await caches.match(request)) || (await caches.match("/offline"));
  }
}
```

### 3. Stale-while-revalidate (for images, low-stakes API GETs)
Serve cached immediately, refresh the cache in the background. Fast and self-healing.
```js
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetching;
}
```

### 4. Network-only (for mutations)
POST/PUT/DELETE must never be served from cache. Just `fetch`. Optionally enqueue failed writes for Background Sync (see `advanced.md`) — but never serve a fake success.

### 5. Cache-only (rarely)
For assets you pre-cached and know will never change in this version. Mostly the app shell on a guaranteed-cached route.

## Routing requests in fetch

```js
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutations: let them pass through

  const url = new URL(request.url);

  // HTML navigations → network-first → offline fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
  // Hashed build assets → cache-first
  if (url.pathname.startsWith("/_next/static/") || /\.(js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  // Images → SWR, bounded
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
  // API GETs → SWR (or network-first if freshness matters)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
});
```

## Offline fallback page

Pre-cache a real `/offline` route (a static HTML page that needs no network). Serve it for failed navigations. Never let the browser's default no-internet page appear — that is the line between "PWA" and "broken site."

## Bounding caches

Caches grow unbounded by default and can get evicted unpredictably or bloat storage. Cap entries and age (Workbox/Serwist do this declaratively via `ExpirationPlugin`; hand-rolled, you trim oldest entries on `put`). Example caps: images 60 entries / 30 days; API responses 50 entries / 1 day.

## Cleanup

Delete old-version caches in `activate` (see `service-worker.md`). Otherwise every deploy leaks a full cache generation.
