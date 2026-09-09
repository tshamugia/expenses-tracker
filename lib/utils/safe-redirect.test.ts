import { describe, expect, it } from 'vitest'
import { safeInternalPath } from './safe-redirect'

describe('safeInternalPath', () => {
  it('keeps same-origin paths (with query strings)', () => {
    expect(safeInternalPath('/oauth/authorize?client_id=1&state=x')).toBe('/oauth/authorize?client_id=1&state=x')
    expect(safeInternalPath('/settings')).toBe('/settings')
  })

  it('falls back for anything that could leave the origin', () => {
    expect(safeInternalPath(null)).toBe('/dashboard')
    expect(safeInternalPath('')).toBe('/dashboard')
    expect(safeInternalPath('https://evil.com')).toBe('/dashboard')
    expect(safeInternalPath('//evil.com/x')).toBe('/dashboard')
    expect(safeInternalPath('/\\evil.com')).toBe('/dashboard')
    expect(safeInternalPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeInternalPath('/ok\r\nLocation: x', '/home')).toBe('/home')
  })
})
