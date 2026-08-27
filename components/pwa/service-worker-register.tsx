'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker (/sw.js) on the client.
 *
 * Only registers in production to avoid interfering with the dev server's
 * HMR and caching. Rendered once from the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      // A worker left over from a previous production run on this origin
      // keeps serving /_next/static chunks cache-first, hydrating dev pages
      // with stale code. Unregister it and drop its caches.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      })
      if ('caches' in window) {
        caches.keys().then((keys) =>
          keys.forEach((key) => {
            if (key.startsWith('extracker-')) caches.delete(key)
          })
        )
      }
      return
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker registration failed:', error)
      })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
