import type { MetadataRoute } from 'next'

/**
 * PWA Web App Manifest.
 * Next.js serves this at /manifest.webmanifest and auto-injects the
 * <link rel="manifest"> tag into every page's <head>.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ExtraTracker - Expense Tracker',
    short_name: 'ExTracker',
    description: 'Track your expenses and payments with ease',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#1a1f35',
    background_color: '#ffffff',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
