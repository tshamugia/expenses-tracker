import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONSERVATIVE_FACTOR,
  forecastNextMonthIncome,
} from './income-forecast'

const month = (m: string, total: number) => ({ month: m, total })

describe('forecastNextMonthIncome', () => {
  it('sums stable total from multiple sources', () => {
    const result = forecastNextMonthIncome({
      stableSources: [
        { expectedAmount: 3500, currency: 'GEL' },
        { expectedAmount: 1200, currency: 'GEL' },
      ],
      variableHistory: [],
    })

    expect(result.stableTotal).toBe(4700)
    expect(result.total).toBe(4700)
  })

  it('returns 0 stable total with no sources', () => {
    const result = forecastNextMonthIncome({
      stableSources: [],
      variableHistory: [],
    })

    expect(result.stableTotal).toBe(0)
    expect(result.total).toBe(0)
  })

  it.each([[[]], [[month('2026-06', 900)]], [[month('2026-05', 900), month('2026-06', 1100)]]])(
    'history shorter than 3 months → estimate 0, method no_history',
    (variableHistory) => {
      const result = forecastNextMonthIncome({
        stableSources: [{ expectedAmount: 3500, currency: 'GEL' }],
        variableHistory,
      })

      expect(result.variableEstimate).toBe(0)
      expect(result.method).toBe('no_history')
      expect(result.monthsOfHistory).toBe(variableHistory.length)
      expect(result.total).toBe(3500)
    }
  )

  it('history [1000, 1200, 800] → min(1000×0.75, 800) = 750', () => {
    const result = forecastNextMonthIncome({
      stableSources: [],
      variableHistory: [
        month('2026-04', 1000),
        month('2026-05', 1200),
        month('2026-06', 800),
      ],
    })

    expect(result.variableEstimate).toBe(750)
    expect(result.method).toBe('average_discounted')
    expect(result.monthsOfHistory).toBe(3)
    expect(result.total).toBe(750)
  })

  it('history [1000, 0, 1200] → zero month counts, minimum wins → estimate 0', () => {
    const result = forecastNextMonthIncome({
      stableSources: [{ expectedAmount: 2000, currency: 'GEL' }],
      variableHistory: [
        month('2026-04', 1000),
        month('2026-05', 0),
        month('2026-06', 1200),
      ],
    })

    expect(result.variableEstimate).toBe(0)
    expect(result.method).toBe('historical_min')
    expect(result.total).toBe(2000)
  })

  it('respects custom conservative factor bounds (0.7 / 0.8)', () => {
    const variableHistory = [
      month('2026-04', 1000),
      month('2026-05', 1000),
      month('2026-06', 1000),
    ]

    const low = forecastNextMonthIncome({
      stableSources: [],
      variableHistory,
      conservativeFactor: 0.7,
    })
    const high = forecastNextMonthIncome({
      stableSources: [],
      variableHistory,
      conservativeFactor: 0.8,
    })

    expect(low.variableEstimate).toBe(700)
    expect(high.variableEstimate).toBe(800)
  })

  it('defaults factor to 0.75', () => {
    expect(DEFAULT_CONSERVATIVE_FACTOR).toBe(0.75)

    const result = forecastNextMonthIncome({
      stableSources: [],
      variableHistory: [
        month('2026-04', 1000),
        month('2026-05', 1000),
        month('2026-06', 1000),
      ],
    })

    expect(result.variableEstimate).toBe(750)
  })

  it('uses historical_min when the minimum is below the discounted average', () => {
    const result = forecastNextMonthIncome({
      stableSources: [],
      variableHistory: [
        month('2026-03', 2000),
        month('2026-04', 2000),
        month('2026-05', 2000),
        month('2026-06', 100),
      ],
    })

    // avg = 1525, discounted = 1143.75, min = 100 → min wins
    expect(result.variableEstimate).toBe(100)
    expect(result.method).toBe('historical_min')
    expect(result.monthsOfHistory).toBe(4)
  })
})
