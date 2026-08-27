import { describe, expect, it } from 'vitest'
import { splitWindfall } from './windfall'

describe('splitWindfall', () => {
  it('splits 300 at 50/30/20 into 150/90/60', () => {
    expect(splitWindfall(300, { debt: 50, goals: 30, free: 20 })).toEqual({
      toDebt: 150,
      toGoals: 90,
      toFree: 60,
    })
  })

  it('lands the rounding remainder on free so the parts sum to the excess', () => {
    const split = splitWindfall(10.01, { debt: 50, goals: 30, free: 20 })
    expect(split.toDebt + split.toGoals + split.toFree).toBe(10.01)
  })

  it('returns all zeros for a non-positive excess', () => {
    expect(splitWindfall(0, { debt: 50, goals: 30, free: 20 })).toEqual({
      toDebt: 0,
      toGoals: 0,
      toFree: 0,
    })
    expect(splitWindfall(-100, { debt: 50, goals: 30, free: 20 })).toEqual({
      toDebt: 0,
      toGoals: 0,
      toFree: 0,
    })
  })

  it('throws when the percentages do not sum to 100', () => {
    expect(() => splitWindfall(300, { debt: 50, goals: 30, free: 30 })).toThrow()
    expect(() => splitWindfall(300, { debt: 40, goals: 30, free: 20 })).toThrow()
  })

  it('honors custom percentages', () => {
    expect(splitWindfall(1000, { debt: 100, goals: 0, free: 0 })).toEqual({
      toDebt: 1000,
      toGoals: 0,
      toFree: 0,
    })
  })
})
