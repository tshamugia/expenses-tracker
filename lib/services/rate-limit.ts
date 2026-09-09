/**
 * Minimal in-memory failure-count rate limiter (fixed window per key).
 * Used by app/api/mcp to blunt token brute-forcing: after `max` failed
 * authentications from one client within `windowMs`, further requests are
 * refused until the window rolls over. Pure and clock-injectable for tests.
 *
 * Scope note: state is per process, which is what a single Railway instance
 * runs. Good enough as a brake; not a substitute for edge rate limiting.
 */

export interface RateLimiterOptions {
  windowMs: number
  max: number
}

export interface RateLimitDecision {
  blocked: boolean
  /** Failures recorded in the current window (after this check). */
  failures: number
  /** When the current window ends (ms since epoch), or null if no window is open. */
  resetAt: number | null
}

interface WindowState {
  count: number
  windowStart: number
}

export interface RateLimiter {
  /** Is `key` currently blocked? Never mutates state. */
  isBlocked(key: string, now?: number): RateLimitDecision
  /** Record a failed attempt for `key`; returns the resulting decision. */
  recordFailure(key: string, now?: number): RateLimitDecision
  /** Forget `key` (e.g. after a successful authentication). */
  clear(key: string): void
  /** Drop expired windows to keep memory bounded. */
  prune(now?: number): void
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions): RateLimiter {
  if (windowMs <= 0 || max <= 0) throw new Error('windowMs and max must be positive')
  const state = new Map<string, WindowState>()

  const live = (key: string, now: number): WindowState | null => {
    const s = state.get(key)
    if (!s) return null
    if (now - s.windowStart >= windowMs) {
      state.delete(key)
      return null
    }
    return s
  }

  const decision = (s: WindowState | null): RateLimitDecision => ({
    blocked: !!s && s.count >= max,
    failures: s?.count ?? 0,
    resetAt: s ? s.windowStart + windowMs : null,
  })

  return {
    isBlocked(key, now = Date.now()) {
      return decision(live(key, now))
    },
    recordFailure(key, now = Date.now()) {
      const s = live(key, now) ?? { count: 0, windowStart: now }
      s.count += 1
      state.set(key, s)
      return decision(s)
    },
    clear(key) {
      state.delete(key)
    },
    prune(now = Date.now()) {
      for (const [key, s] of state) {
        if (now - s.windowStart >= windowMs) state.delete(key)
      }
    },
  }
}

/** Best-effort client address for rate-limit keys (Railway sets x-forwarded-for). */
export function clientKeyFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim() || 'unknown'
  return req.headers.get('x-real-ip') ?? 'unknown'
}
