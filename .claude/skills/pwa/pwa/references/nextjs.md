# Next.js App Router PWA

Don't hand-roll a raw service worker inside Next — its build output (hashed `_next/static` chunks, route manifests) is hard to pre-cache correctly by hand. Use a plugin that integrates with the build. Two good options: **`@ducanh2912/next-pwa`** (Workbox-based, the maintained successor to `next-pwa`) or **Serwist** (`@serwist/next`, more modern, TS-first). Both generate the service worker and wire up runtime caching.

> Confirm current setup against Context7 (`/serwist/serwist`) — these plugins track Next releases and APIs shift.

## Manifest via the App Router

Define it as code so it's typed and built with the app. `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Project Manager",
    short_name: "PM",
    start_url: "/?source=pwa",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

Next serves this at `/manifest.webmanifest` and links it automatically. Set `theme_color` and Apple tags via the `metadata`/`viewport` exports in `app/layout.tsx`:

```ts
export const viewport = { themeColor: "#0f172a" };
export const metadata = {
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PM" },
};
```

## Setup with @ducanh2912/next-pwa

```bash
npm i @ducanh2912/next-pwa
```

`next.config.mjs`:
```js
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // critical — see below
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: { document: "/offline" }, // pre-cached offline page
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.destination === "image",
        handler: "StaleWhileRevalidate",
        options: { cacheName: "images", expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 } },
      },
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkFirst",
        options: { cacheName: "api", networkTimeoutSeconds: 5, expiration: { maxEntries: 50, maxAgeSeconds: 24 * 3600 } },
      },
    ],
  },
});

export default withPWA({ /* your next config */ });
```

Build an `app/offline/page.tsx` — a static page (no data fetching) that renders when navigation fails.

## Why `disable` in development is non-negotiable

A live service worker caches aggressively and will serve stale chunks during `next dev`, producing maddening "my edits don't show up" / hydration-mismatch bugs and HMR breakage. Always disable the SW in dev; test PWA behavior with a production build (`next build && next start`) or a preview deploy.

## App Router specifics

- The SW only caches what it sees. For dynamic App Router routes, lean on `runtimeCaching` (network-first for HTML) rather than trying to pre-cache every route.
- Server Components render HTML on the server — your caching strategy for navigations (network-first → `/offline`) is what gives offline support, not RSC itself.
- Don't cache authenticated API responses in a shared cache without thought — scope or skip caching for per-user sensitive data.

## NX monorepo notes

- Place the PWA config in the Next app's project (`apps/web/next.config.mjs`), not the workspace root.
- Add the generated `public/sw.js` and `public/workbox-*.js` to `.gitignore` — they're build artifacts.
- Icons/manifest assets live in that app's `public/`. If `nx affected` rebuilds, the SW regenerates with fresh asset hashes automatically.

## Path to native (Expo)

If a later move to React Native / Expo is planned: keep business logic in shared libs (NX `data-access`/`util` libraries), treat the PWA as the web target, and don't couple core logic to service-worker APIs. The PWA gives installability + offline now; Expo replaces only the shell later.
