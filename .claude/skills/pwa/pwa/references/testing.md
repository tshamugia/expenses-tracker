# Testing & Verification

A PWA "works in the browser with DevTools open" and still fails on a real device with a real cached state. Test deliberately.

## Installability checklist

- [ ] Served over **HTTPS** (or localhost in dev).
- [ ] Manifest parses with no errors (DevTools → Application → Manifest), includes `name`, `short_name`, `start_url`, `display: standalone`, `background_color`, `theme_color`, and a 512×512 icon.
- [ ] A service worker is **registered and activated** with a `fetch` handler (DevTools → Application → Service Workers).
- [ ] An install affordance appears (Chrome address-bar install icon, or your custom button fires on `beforeinstallprompt`).
- [ ] Lighthouse → PWA / installability audit passes.

## Offline checklist

- [ ] DevTools → Network → **Offline**, reload: the app shell loads from cache.
- [ ] Navigating to an uncached route while offline shows your `/offline` page — **not** the browser's default no-internet page.
- [ ] Cached images/assets still render offline.
- [ ] Mutations while offline either queue (Background Sync / outbox) or surface a clear error — never a fake success.

## Update checklist (the one most people skip)

- [ ] Bump the version constant / redeploy, reload twice: the new service worker is detected (Application → Service Workers shows "waiting").
- [ ] Your "update available" prompt appears and reloading activates the new version.
- [ ] Old-version caches are deleted on activate (Application → Cache Storage shows only current-version caches).
- [ ] No stale chunk / hydration-mismatch errors after update.

## DevTools panels that matter

- **Application → Manifest** — installability blockers, icon preview.
- **Application → Service Workers** — current/waiting SW, "Update on reload" and "Bypass for network" toggles (turn these on while developing the SW).
- **Application → Cache Storage** — exactly what's cached, per cache name. Verify cleanup.
- **Lighthouse** — PWA category for an automated pass.

## Common failure modes

- **"My changes don't show up."** Stale service worker. You didn't bump the version constant, or you're testing in `next dev` with the SW enabled. Disable SW in dev; bump version on deploy.
- **Install prompt never appears.** Manifest invalid (missing required field/icon), no HTTPS, or no activated SW with a fetch handler. Check Application → Manifest for blockers.
- **Works in browser, breaks on real device.** A real device carries cached state from a previous version. Test updates against a real prior cache, not a fresh incognito session.
- **Offline shows the dinosaur.** No `/offline` fallback wired into the navigation fetch handler.
- **Caches balloon / random eviction.** No expiration caps on runtime caches.
- **iOS: no icon / no push.** iOS uses `apple-touch-icon` (not manifest icons) and only delivers push to an installed PWA.

## Real-device testing

Install prompts, offline fallbacks, and push behave differently on real iOS/Android than in desktop DevTools emulation. Before any release that touches the service worker, verify on at least one real Android device and one real iOS device.
