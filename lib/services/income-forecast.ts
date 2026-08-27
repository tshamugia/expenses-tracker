/**
 * Income forecast engine (Phase 1, PRD R2 — conservative forecast).
 * Pure function: no DB, no auth, no Date.now — fully unit-testable.
 */

export type ForecastInput = {
  stableSources: { expectedAmount: number; currency: string }[]
  variableHistory: { month: string; total: number }[] // last 3–6 months, in default currency
  conservativeFactor?: number // default 0.75 (R2: 70–80% of average)
}

export type IncomeForecast = {
  stableTotal: number
  variableEstimate: number // min(avg × factor, historicalMin) — R2
  total: number
  method: 'average_discounted' | 'historical_min' | 'no_history'
  monthsOfHistory: number
}

export const DEFAULT_CONSERVATIVE_FACTOR = 0.75
const MIN_HISTORY_MONTHS = 3

/**
 * Forecast next month's income.
 *
 * Rules (R2):
 * - history < 3 months → variableEstimate = 0, method 'no_history'
 * - history ≥ 3 months → min(average × factor, period minimum) — the lower of
 *   the two conservative options. Months with 0 variable income COUNT as 0.
 */
export function forecastNextMonthIncome(input: ForecastInput): IncomeForecast {
  const factor = input.conservativeFactor ?? DEFAULT_CONSERVATIVE_FACTOR

  const stableTotal = input.stableSources.reduce(
    (sum, source) => sum + source.expectedAmount,
    0
  )

  const monthsOfHistory = input.variableHistory.length

  if (monthsOfHistory < MIN_HISTORY_MONTHS) {
    return {
      stableTotal,
      variableEstimate: 0,
      total: stableTotal,
      method: 'no_history',
      monthsOfHistory,
    }
  }

  const totals = input.variableHistory.map((m) => m.total)
  const average = totals.reduce((sum, t) => sum + t, 0) / monthsOfHistory
  const discounted = average * factor
  const historicalMin = Math.min(...totals)

  const variableEstimate = Math.min(discounted, historicalMin)
  const method =
    discounted <= historicalMin ? 'average_discounted' : 'historical_min'

  return {
    stableTotal,
    variableEstimate,
    total: stableTotal + variableEstimate,
    method,
    monthsOfHistory,
  }
}
