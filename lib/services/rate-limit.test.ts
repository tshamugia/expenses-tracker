import { describe, expect, it } from 'vitest'
import { clientKeyFromRequest, createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('rejects non-positive options', () => {
    expect(() => createRateLimiter({ windowMs: 0, max: 5 })).toThrow()
    expect(() => createRateLimiter({ windowMs: 1000, max: 0 })).toThrow()
  })

  it('is not blocked before any failure', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 3 })
    expect(rl.isBlocked('a', 0)).toEqual({ blocked: false, failures: 0, resetAt: null })
  })

  it('blocks after `max` failures inside the window', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 3 })
    expect(rl.recordFailure('a', 0).blocked).toBe(false)
    expect(rl.recordFailure('a', 100).blocked).toBe(false)
    const third = rl.recordFailure('a', 200)
    expect(third).toEqual({ blocked: true, failures: 3, resetAt: 1000 })
    expect(rl.isBlocked('a', 900).blocked).toBe(true)
  })

  it('opens a fresh window once the old one expired', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 2 })
    rl.recordFailure('a', 0)
    rl.recordFailure('a', 10)
    expect(rl.isBlocked('a', 999).blocked).toBe(true)
    expect(rl.isBlocked('a', 1000)).toEqual({ blocked: false, failures: 0, resetAt: null })
    expect(rl.recordFailure('a', 1001)).toEqual({ blocked: false, failures: 1, resetAt: 2001 })
  })

  it('keeps keys independent and clears a key on demand', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1 })
    rl.recordFailure('a', 0)
    expect(rl.isBlocked('a', 1).blocked).toBe(true)
    expect(rl.isBlocked('b', 1).blocked).toBe(false)
    rl.clear('a')
    expect(rl.isBlocked('a', 2).blocked).toBe(false)
  })

  it('prunes expired windows only', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1 })
    rl.recordFailure('old', 0)
    rl.recordFailure('new', 900)
    rl.prune(1000)
    expect(rl.isBlocked('old', 1000).failures).toBe(0)
    expect(rl.isBlocked('new', 1000).failures).toBe(1)
  })
})

describe('clientKeyFromRequest', () => {
  it('prefers the first x-forwarded-for hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })
    expect(clientKeyFromRequest(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientKeyFromRequest(new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9')
    expect(clientKeyFromRequest(new Request('http://x'))).toBe('unknown')
  })
})
