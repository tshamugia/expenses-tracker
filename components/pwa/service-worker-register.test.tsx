import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorkerRegister } from './service-worker-register'

function mockServiceWorker() {
  const unregister = vi.fn().mockResolvedValue(true)
  const getRegistrations = vi.fn().mockResolvedValue([{ unregister }, { unregister }])
  const register = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistrations, register },
    configurable: true,
  })
  return { unregister, getRegistrations, register }
}

function mockCaches() {
  const del = vi.fn().mockResolvedValue(true)
  const keys = vi.fn().mockResolvedValue(['extracker-v1', 'other-app-cache'])
  Object.defineProperty(window, 'caches', {
    value: { keys, delete: del },
    configurable: true,
  })
  return { keys, delete: del }
}

afterEach(() => {
  vi.unstubAllEnvs()
  // @ts-expect-error cleanup of test-injected mocks
  delete navigator.serviceWorker
  // @ts-expect-error cleanup of test-injected mocks
  delete window.caches
})

describe('ServiceWorkerRegister', () => {
  it('outside production, unregisters leftover workers and deletes only extracker caches', async () => {
    const sw = mockServiceWorker()
    const caches = mockCaches()

    render(<ServiceWorkerRegister />)

    await waitFor(() => expect(sw.unregister).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(caches.delete).toHaveBeenCalledWith('extracker-v1'))
    expect(caches.delete).not.toHaveBeenCalledWith('other-app-cache')
    expect(sw.register).not.toHaveBeenCalled()
  })

  it('in production, registers /sw.js and does not unregister', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const sw = mockServiceWorker()
    const caches = mockCaches()

    render(<ServiceWorkerRegister />)

    await waitFor(() => expect(sw.register).toHaveBeenCalledWith('/sw.js'))
    expect(sw.getRegistrations).not.toHaveBeenCalled()
    expect(caches.delete).not.toHaveBeenCalled()
  })

  it('does nothing when serviceWorker is unsupported', () => {
    const caches = mockCaches()

    expect(() => render(<ServiceWorkerRegister />)).not.toThrow()
    expect(caches.keys).not.toHaveBeenCalled()
  })
})
