# Web App Manifest

The manifest is the installability gate. A missing or invalid field silently disables the install prompt in most browsers.

## Required-for-install fields

```json
{
  "name": "Project Manager",
  "short_name": "PM",
  "description": "Manage projects, tasks, and teams.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- **`name` / `short_name`** — full name for splash/listings; `short_name` (≤12 chars ideal) for the home-screen label.
- **`start_url`** — where the app opens. Add a query param (`?source=pwa`) so analytics can distinguish installed launches. Must be inside `scope`.
- **`scope`** — navigation boundary. Links outside scope open in an in-app browser, not the app window.
- **`display`** — use `standalone` (app window, no browser chrome). `fullscreen` hides even the status bar; `minimal-ui` keeps minimal navigation; `browser` defeats the purpose.
- **`background_color`** — shown on the splash screen before first paint; match your app's initial background to avoid a flash.
- **`theme_color`** — colors the title bar / status bar. Keep it consistent with the `<meta name="theme-color">` tag.

## Icons

- **Minimum for install: a 512×512 PNG.** Also provide 192×192. Provide both `any` and `maskable` purposes.
- **Maskable icons** must keep critical content inside the safe zone (central ~80% / 40% radius), because Android crops them into shapes. A normal icon used as maskable will get clipped. Test at maskable.app.
- Add Apple touch icon separately (see iOS section) — iOS ignores manifest icons for the home screen.

## HTML head tags

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0f172a" />

<!-- iOS: it largely ignores the manifest -->
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="PM" />
```

## iOS quirks (still true in 2026)

- iOS reads `apple-touch-icon`, not manifest icons, for the home-screen icon. Provide a 180×180 PNG.
- No `beforeinstallprompt` event — installation is manual via Share → Add to Home Screen. Show your own instructions for iOS Safari users.
- Splash screens need `apple-touch-startup-image` link tags per device size if you want a custom one (optional).
- Web push only works for a PWA already installed to the home screen (iOS 16.4+).

## Validation

- DevTools → **Application → Manifest**: every field parsed, no red errors, icons listed, "Installability" section shows no blockers.
- Lighthouse → PWA category (or the installability audit) confirms manifest + service worker + HTTPS.
