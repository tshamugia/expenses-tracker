---
name: pwa
description: Expert guidance for turning a web app into a production-grade, installable Progressive Web App — web app manifest, service worker lifecycle, caching strategies, offline-first behavior, install prompts, web push, and background sync. Primary focus is Next.js 15+ App Router (@ducanh2912/next-pwa / Serwist), with framework-agnostic core principles. Use whenever the user wants to make an app installable, work offline, cache assets, add to home screen, register a service worker, handle PWA updates, send web push, pass the Lighthouse PWA audit, or build the PWA layer before going native (e.g. Expo). Triggers on "PWA," "progressive web app," "service worker," "web app manifest," "installable," "add to home screen," "offline," "offline-first," "cache strategy," "Workbox," "Serwist," "next-pwa," "install prompt," "beforeinstallprompt," "web push," "background sync," "app shell," or any request to make a site work offline, be installed, or behave like an app. For App Router rendering/data use nextjs-frontend instead.
---

# PWA

Turn a web app into a fast, reliable, **installable** Progressive Web App that works offline and updates safely. This skill encodes current (2026) best practices for the decisions teams most often get wrong: what goes in the manifest, which cache strategy applies to which request, how to update a service worker without breaking live sessions, and how to treat advanced APIs (push, background sync) as progressive enhancements rather than load-bearing dependencies.

## How to use this skill

1. Identify what the task touches: installability (manifest + icons), the service worker (registration, lifecycle, updates), caching strategy, offline UX, install prompt, push notifications, or background sync.
2. Apply the **Core principles** below to every task — they are non-negotiable for a real PWA.
3. Open the matching reference file for anything non-trivial. The references contain complete, copy-ready implementations and the rationale behind them.
4. Default to the **Next.js path** (`references/nextjs.md`) for App Router projects — hand-rolling a service worker inside Next is a common source of bugs. Use the framework-agnostic path only when there's no build tooling to lean on.
5. For fast-moving APIs (Serwist/Workbox, Web Push), confirm current behavior via Context7 (`/serwist/serwist`, `/googlechrome/workbox`) rather than guessing.

## Core principles

These four things are what actually separate a "PWA" from a normal website. Get them right before anything fancy.

**1. HTTPS or localhost, always.** Service workers and most PWA APIs refuse to run on insecure origins. `localhost` is exempt for development; everything else needs TLS. State this early if the user is deploying somewhere without it.

**2. A valid manifest is the installability gate.** Without a complete web app manifest the browser will not offer installation. The required-for-install fields are: `name`, `short_name`, `start_url`, `display` (use `standalone`), `background_color`, `theme_color`, and at least one icon — a 512×512 PNG is the minimum, and you want 192×192 too. Missing any of these silently disables the install prompt, so verify in DevTools → Application → Manifest (no red errors). See `references/manifest.md`.

**3. A registered service worker with a `fetch` handler.** Installability requires a service worker that controls the page and can serve a response when offline. The service worker is also where caching and offline behavior live. The single most important lifecycle rule: **bump a version constant on every deploy** so the browser detects the change and re-caches — a service worker that's byte-identical to the cached one will never update. See `references/service-worker.md`.

**4. Offline must never show the browser's dinosaur.** Always provide a custom offline fallback — at minimum a cached `/offline` page for failed navigations. An "offline-capable" app that shows Chrome's default no-internet page fails the basic promise of a PWA. See `references/caching.md`.

## Decision: which path

- **Next.js / App Router project** → use `@ducanh2912/next-pwa` or Serwist. Do **not** write a raw service worker and fight Next's build output. → `references/nextjs.md`
- **Vite / plain build** → `vite-plugin-pwa` (Workbox under the hood). Same caching concepts as the Next path.
- **No build tooling, or you need full control** → hand-written service worker. → `references/service-worker.md` + `references/caching.md`

## Caching strategy cheat-sheet

Pick per *class of request*, not for the whole app. This is the highest-leverage decision in a PWA.

| Request type | Strategy | Why |
|---|---|---|
| App shell / HTML navigations | Network-first, fall back to cache, then `/offline` | Users should get fresh pages online, something offline |
| Hashed static assets (JS/CSS/fonts) | Cache-first | Content-hashed filenames never change; serve instantly |
| Images | Stale-while-revalidate, capped (e.g. 60 entries / 30 days) | Fast, self-healing, bounded |
| API / data (GET) | Stale-while-revalidate or network-first w/ short cache | Balance freshness vs. offline reads |
| API mutations (POST/PUT/DELETE) | Network-only (+ Background Sync queue as enhancement) | Never serve a stale write; never silently drop one |

Full implementations and the update-without-breakage pattern are in `references/caching.md` and `references/service-worker.md`.

## Progressive enhancement: advanced APIs

These do **not** have universal support — feature-detect every one and degrade gracefully. As of 2026, roughly half of mobile users (iOS Safari, Firefox) get no Background Sync, and iOS web push requires an installed PWA.

- **Install prompt** (`beforeinstallprompt`): Chromium-only event; capture it, show your own button, call `prompt()` on click. iOS has no event — detect iOS Safari and show manual "Add to Home Screen" instructions instead.
- **Web Push**: requires a service worker, user permission, and a push subscription (VAPID keys). Subscriptions churn — handle re-subscription. iOS only delivers push to installed PWAs (16.4+).
- **Background Sync**: `'sync' in registration` — Chromium/Samsung only. Always pair with an in-page retry path; never make it the only retry mechanism.

Details and copy-ready code in `references/advanced.md`.

## Reference files

Read the relevant file before writing code in that area:

- `references/manifest.md` — Complete manifest fields, icon sizes/maskable icons, `<link>`/meta tags, iOS quirks, validation.
- `references/service-worker.md` — Registration, install/activate/fetch lifecycle, versioning, safe update flow (`skipWaiting` + reload prompt), unregistering.
- `references/caching.md` — All five caching strategies with code, cache cleanup on activate, offline fallback page, runtime caching config.
- `references/nextjs.md` — App Router setup with `@ducanh2912/next-pwa`/Serwist: manifest via `app/manifest.ts`, runtime caching, disabling in dev, NX monorepo notes.
- `references/advanced.md` — Custom install prompt (incl. iOS), Web Push end-to-end (VAPID, subscribe, server send), Background Sync with fallback.
- `references/testing.md` — Lighthouse/installability checklist, DevTools Application panel, real-device gotchas, common failure modes.
