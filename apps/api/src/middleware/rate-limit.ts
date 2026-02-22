import { Elysia } from 'elysia'
import { fail, ERROR_CODES } from '../utils/response'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  /** Timestamps (ms) of requests within the current window */
  timestamps: number[]
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number
  /** Window duration in seconds */
  windowSeconds: number
}

interface RateLimitOptions {
  /** Rate limit for general API requests */
  general: RateLimitConfig
  /** Rate limit for authentication endpoints (login, register, etc.) */
  auth: RateLimitConfig
  /** Rate limit for password reset endpoints */
  passwordReset: RateLimitConfig
  /** How often to run the cleanup sweep, in milliseconds */
  cleanupIntervalMs: number
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: RateLimitOptions = {
  general: { maxRequests: 100, windowSeconds: 60 },
  auth: { maxRequests: 10, windowSeconds: 60 },
  passwordReset: { maxRequests: 5, windowSeconds: 60 },
  cleanupIntervalMs: 60_000, // sweep every 60 seconds
}

// ─── Path matchers ──────────────────────────────────────────────────────────

/** Auth endpoints that receive the stricter auth-tier limit */
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/google']

/** Password-reset endpoints that receive the strictest limit */
const PASSWORD_RESET_PATHS = [
  '/auth/forgot-password',
  '/auth/verify-code',
  '/auth/reset-password',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determine which rate-limit tier a request path falls into.
 */
function getTierForPath(
  path: string,
): 'passwordReset' | 'auth' | 'general' {
  if (PASSWORD_RESET_PATHS.some((p) => path.startsWith(p))) {
    return 'passwordReset'
  }
  if (AUTH_PATHS.some((p) => path.startsWith(p))) {
    return 'auth'
  }
  return 'general'
}

/**
 * Extract the client IP address from the request.
 *
 * Priority:
 *   1. X-Forwarded-For header (first IP in the list, common behind proxies/load balancers)
 *   2. X-Real-IP header (set by some reverse proxies like Nginx)
 *   3. Elysia/Bun server connection info (direct connections)
 *   4. Fallback to "unknown" (guarantees a bucket key always exists)
 */
function getClientIp(request: Request, server: { requestIP?: (req: Request) => { address: string } | null } | null): string {
  // Proxy headers
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // Bun server.requestIP (available on Bun.serve instances)
  if (server?.requestIP) {
    const info = server.requestIP(request)
    if (info?.address) return info.address
  }

  return 'unknown'
}

// ─── Sliding Window Rate Limiter ────────────────────────────────────────────

/**
 * In-memory sliding-window rate limiter implemented as an Elysia plugin.
 *
 * Each unique combination of (client IP + tier) gets its own bucket.
 * Expired timestamps are pruned on every check, and a periodic sweep
 * removes stale buckets entirely to prevent memory leaks.
 */
export function rateLimitMiddleware(userOptions?: Partial<RateLimitOptions>) {
  const options: RateLimitOptions = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  }

  /** Map from "ip:tier" to the sliding-window entry */
  const store = new Map<string, RateLimitEntry>()

  // ── Periodic cleanup ────────────────────────────────────────────────
  // Remove buckets that have no timestamps within the largest possible
  // window so the Map does not grow unbounded over time.

  const maxWindowMs =
    Math.max(
      options.general.windowSeconds,
      options.auth.windowSeconds,
      options.passwordReset.windowSeconds,
    ) * 1000

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - maxWindowMs
    for (const [key, entry] of store) {
      // If the most recent timestamp is older than the largest window,
      // the whole bucket is stale.
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
        store.delete(key)
      }
    }
  }, options.cleanupIntervalMs)

  // Allow the process to exit cleanly without waiting for the timer.
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }

  // ── Plugin ──────────────────────────────────────────────────────────

  return new Elysia({ name: 'middleware/rate-limit' })
    .onBeforeHandle({ as: 'global' }, ({ request, set, server }) => {
      const path = new URL(request.url).pathname
      const tier = getTierForPath(path)
      const config = options[tier]
      const ip = getClientIp(request, server)
      const bucketKey = `${ip}:${tier}`

      const now = Date.now()
      const windowStart = now - config.windowSeconds * 1000

      // Get or create the bucket for this IP + tier
      let entry = store.get(bucketKey)
      if (!entry) {
        entry = { timestamps: [] }
        store.set(bucketKey, entry)
      }

      // Prune timestamps older than the sliding window
      // Because timestamps are appended in order, we can find the
      // first index still inside the window via binary-ish scan.
      // For simplicity and given small arrays (max ~100), a filter
      // is efficient enough.
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

      // Check if the limit has been reached
      if (entry.timestamps.length >= config.maxRequests) {
        // Calculate how many seconds until the oldest request in the
        // window expires, giving the client a meaningful Retry-After.
        const oldestInWindow = entry.timestamps[0]
        const retryAfterSeconds = Math.ceil(
          (oldestInWindow + config.windowSeconds * 1000 - now) / 1000,
        )

        set.status = 429
        set.headers['retry-after'] = String(Math.max(retryAfterSeconds, 1))

        return fail('Too many requests. Try again later.', ERROR_CODES.RATE_LIMITED)
      }

      // Record this request
      entry.timestamps.push(now)
    })
    .onStop(() => {
      // Clean up the interval when the server shuts down
      clearInterval(cleanupTimer)
      store.clear()
    })
}
