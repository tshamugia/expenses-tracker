import { useAuthStore } from '../stores/auth-store'
import { getApiUrl } from '../utils/config'

// Public auth endpoints that should never trigger token refresh on 401
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/google',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/verify-code',
  '/auth/reset-password',
]

function isPublicPath(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url.includes(path))
}

let refreshPromise: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, updateTokens, logout } = useAuthStore.getState()

  if (!refreshToken) {
    await logout()
    return false
  }

  try {
    const response = await fetch(`${getApiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      await logout()
      return false
    }

    const json = await response.json()
    if (json.success && json.data) {
      await updateTokens(json.data.accessToken, json.data.refreshToken)
      return true
    }

    await logout()
    return false
  } catch {
    await logout()
    return false
  }
}

function getRefreshPromise(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const { accessToken } = useAuthStore.getState()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

  const headers = new Headers(init?.headers)
  // Ensure Content-Type is set for requests with a body
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let response = await fetch(input, { ...init, headers })

  // On 401, attempt token refresh and retry once — but NOT for public auth endpoints
  if (response.status === 401 && !isPublicPath(url)) {
    const refreshed = await getRefreshPromise()

    if (refreshed) {
      const { accessToken: newToken } = useAuthStore.getState()
      const retryHeaders = new Headers(init?.headers)
      if (newToken) {
        retryHeaders.set('Authorization', `Bearer ${newToken}`)
      }
      response = await fetch(input, { ...init, headers: retryHeaders })
    }
  }

  return response
}
