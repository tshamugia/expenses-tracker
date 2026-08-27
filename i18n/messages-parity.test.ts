import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'
import ka from '../messages/ka.json'

/**
 * Guards the project rule that every user-facing string exists in BOTH
 * languages: any key added to one catalog without the other fails CI.
 */

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      return collectKeys(value as Record<string, unknown>, path)
    }
    return [path]
  })
}

function collectEmpty(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      return collectEmpty(value as Record<string, unknown>, path)
    }
    return typeof value === 'string' && value.trim() === '' ? [path] : []
  })
}

describe('message catalogs (en/ka)', () => {
  it('have exactly the same keys', () => {
    expect(collectKeys(ka).sort()).toEqual(collectKeys(en).sort())
  })

  it('have no empty translations', () => {
    expect(collectEmpty(en)).toEqual([])
    expect(collectEmpty(ka)).toEqual([])
  })
})
