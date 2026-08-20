import { headers } from 'next/headers'

/**
 * Simple in-memory fixed-window rate limiter.
 *
 * Limitation: state lives in process memory, so it resets on restart and is
 * NOT shared across multiple instances / serverless invocations. Adequate for
 * a single-container deploy; swap for Upstash Redis if scaling horizontally.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets (0 when allowed with room to spare). */
  retryAfter: number
}

/**
 * Check and record a hit against a fixed window for the given key.
 * Call once at the top of a sensitive action.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  // No entry or window expired -> start a fresh window.
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    cleanup(now)
    return { allowed: true, remaining: limit - 1, retryAfter: 0 }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count += 1
  return {
    allowed: true,
    remaining: limit - entry.count,
    retryAfter: 0,
  }
}

/** Lazily drop expired entries to keep the map from growing unbounded. */
function cleanup(now: number): void {
  if (store.size < 5000) return
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key)
    }
  }
}

/**
 * Best-effort client IP from proxy headers (Next.js Server Action context).
 * Falls back to 'unknown' so rate limiting still degrades gracefully.
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return headersList.get('x-real-ip') ?? 'unknown'
}
