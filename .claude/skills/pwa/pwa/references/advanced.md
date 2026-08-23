# Advanced APIs (Progressive Enhancement)

Every API here lacks universal support. **Feature-detect and degrade.** As of 2026: Background Sync is Chromium/Samsung only (no Firefox, no Safari); iOS web push requires an installed PWA; `beforeinstallprompt` is Chromium-only.

## Custom install prompt

Chromium fires `beforeinstallprompt`. Capture it, suppress the default mini-infobar, show your own button.

```js
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

async function onInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  hideInstallButton();
}

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  hideInstallButton();
});
```

**iOS has no such event.** Detect iOS Safari and not-already-installed, then show manual instructions:
```js
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
if (isIos && !isStandalone) {
  // Show: "Tap the Share icon, then 'Add to Home Screen'."
}
```

## Web Push (end to end)

Requires: a service worker, user permission, a push subscription, and VAPID keys. iOS delivers push only to an installed PWA (16.4+).

**1. Generate VAPID keys once (server, e.g. with `web-push`):**
```bash
npx web-push generate-vapid-keys
```

**2. Subscribe (client):**
```js
async function subscribePush(reg) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, // required; you must show a notification per push
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
  });
  await fetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub), headers: { "Content-Type": "application/json" } });
  return sub;
}
```

**3. Receive (service worker):**
```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Update", {
      body: data.body, icon: "/icons/icon-192.png", data: { url: data.url ?? "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

**4. Send (server, Node):**
```js
import webpush from "web-push";
webpush.setVapidDetails("mailto:you@example.com", PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);
await webpush.sendNotification(subscription, JSON.stringify({ title, body, url }));
```

**Subscription churn:** subscriptions expire or get invalidated. Handle `pushsubscriptionchange` in the SW (re-subscribe), and delete subscriptions server-side on a 404/410 from the push service.

## Background Sync (enhancement only)

Lets a failed offline write retry when connectivity returns — but only on Chromium/Samsung. **Always pair with an in-page retry queue** so the other half of users aren't left with silently dropped writes.

```js
// Page: try the write; on failure, queue + register sync if available
async function queueWrite(payload) {
  await idbAdd("outbox", payload); // your IndexedDB outbox
  const reg = await navigator.serviceWorker.ready;
  if ("sync" in reg) {
    try { await reg.sync.register("flush-outbox"); return; } catch {}
  }
  // Fallback: retry in-page when back online
  window.addEventListener("online", flushOutboxInPage, { once: true });
}
```
```js
// SW
self.addEventListener("sync", (event) => {
  if (event.tag === "flush-outbox") event.waitUntil(flushOutbox());
});
```

Keep the outbox idempotent (dedupe by client-generated id) so a retry can't double-submit.
