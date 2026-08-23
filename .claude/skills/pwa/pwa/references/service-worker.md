# Service Worker: Lifecycle & Updates

The service worker is a background script that intercepts network requests. It enables offline, caching, and push. The hard parts are not registration — they're the lifecycle and safe updates.

## Registration

Register after load so it doesn't compete with first paint. Guard for support.

```js
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("SW registration failed:", err));
  });
}
```

A service worker can only control pages within its scope. Serving `sw.js` from the root gives it `/` scope. (Frameworks usually handle this for you — see `nextjs.md`.)

## Lifecycle: install → wait → activate

1. **install** — runs once per new SW version. Pre-cache the app shell here.
2. **waiting** — if an old SW still controls open tabs, the new one waits. This is the source of "my changes don't show up."
3. **activate** — the new SW takes control. Clean up old caches here.

## The version constant — the single most important rule

The browser only re-downloads resources when the **service worker file's bytes change**. Bump a version constant on every deploy (ideally injected from your build, e.g. a git SHA), so cache names rotate and stale assets get cleared:

```js
const VERSION = "v2026.05.29-1"; // bump every deploy
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const APP_SHELL = ["/", "/offline", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(VERSION)) // delete every old-version cache
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});
```

`self.clients.claim()` lets the activated SW control existing tabs immediately.

## Safe update flow (don't break sessions in flight)

`skipWaiting()` activates a new SW immediately, but if you call it unconditionally you can swap assets out from under a page mid-session and break it. The safe pattern: let the new SW wait, **tell the user**, and reload only on their action.

In the SW:
```js
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
```

In the page:
```js
let refreshing = false;
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

navigator.serviceWorker.register("/sw.js").then((reg) => {
  reg.addEventListener("updatefound", () => {
    const sw = reg.installing;
    sw?.addEventListener("statechange", () => {
      if (sw.state === "installed" && navigator.serviceWorker.controller) {
        // New version ready — show a toast: "Update available — Reload"
        // On click: sw.postMessage({ type: "SKIP_WAITING" })
      }
    });
  });
});
```

## fetch handler

Required for installability and where caching lives. Keep it strategy-based — see `caching.md`. Never blanket-cache everything; route by request type.

## Unregistering / killing a broken SW

If a bad SW ships, you need a recovery path. Ship a SW that calls `self.registration.unregister()` then reloads clients, or document the DevTools → Application → Service Workers → Unregister flow. This is why the version constant + `activate` cleanup matters — it's your remote kill switch for stale caches.
