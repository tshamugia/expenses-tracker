/**
 * Stability-path engine (Phase 4, PRD §7.6 — the stability stages & main goals).
 * Pure functions: no DB, no auth, no Date.now — the caller passes `from` so
 * projections are deterministic.
 *
 * The stability path is a fixed ladder the user climbs:
 *   0: initial buffer (500₾) → 1: one-month reserve → 2: debt-free →
 *   3: three-month reserve → (4: everything achieved).
 * The "current stage" is the lowest rung not yet cleared.
 */

import { addMonths } from 'date-fns'
import { roundMoney } from '@/lib/services/amortization'

/** Initial safety buffer (₾) that clears stage 0. */
export const INITIAL_BUFFER = 500

export type StabilityStage = 0 | 1 | 2 | 3 | 4

export type ReserveState = {
  saved: number
  oneMonthTarget: number
  threeMonthTarget: number
}

/**
 * The stage the user is currently on (lowest uncompleted rung).
 * - 0 cleared: saved ≥ 500 (initial buffer)
 * - 1 cleared: saved ≥ one-month reserve target
 * - 2 cleared: no remaining debt principal
 * - 3 cleared: saved ≥ three-month reserve target
 * All cleared → 4 (achieved).
 */
export function currentStabilityStage(
  reserve: ReserveState,
  totalDebtPrincipal: number
): StabilityStage {
  const saved = reserve.saved
  if (saved < INITIAL_BUFFER) return 0
  if (saved < reserve.oneMonthTarget) return 1
  if (totalDebtPrincipal > 0) return 2
  if (saved < reserve.threeMonthTarget) return 3
  return 4
}

export type DebtFreeInput = {
  originalPrincipal: number
  remainingPrincipal: number
  monthlyPrincipalAvg: number // recent average principal cleared per month
}

export type DebtFreeProjection = {
  paidPct: number // % of the original total principal already cleared (0–100)
  remaining: number
  projectedDate: Date | null // at the current pace; null when pace ≤ 0
}

/**
 * Debt-free projection across all debts. paidPct is measured against the
 * original total principal; projectedDate extrapolates the current combined
 * monthly principal pace from `from`. A pace of 0 (nothing being paid) yields a
 * null date — "at this pace, never".
 */
export function debtFreeProjection(
  debts: DebtFreeInput[],
  from: Date = new Date()
): DebtFreeProjection {
  const originalTotal = roundMoney(
    debts.reduce((sum, d) => sum + d.originalPrincipal, 0)
  )
  const remaining = roundMoney(
    debts.reduce((sum, d) => sum + d.remainingPrincipal, 0)
  )
  const monthlyPace = roundMoney(
    debts.reduce((sum, d) => sum + Math.max(0, d.monthlyPrincipalAvg), 0)
  )

  const paidPct =
    originalTotal <= 0
      ? 100
      : Math.min(100, Math.max(0, ((originalTotal - remaining) / originalTotal) * 100))

  let projectedDate: Date | null = null
  if (remaining <= 0) {
    projectedDate = new Date(from)
  } else if (monthlyPace > 0) {
    const months = Math.ceil(remaining / monthlyPace)
    projectedDate = addMonths(from, months)
  }

  return { paidPct, remaining, projectedDate }
}

/**
 * Net position = liquid savings (reserve + goals) − total debt principal.
 * Can be negative (more debt than savings).
 */
export function netPosition(
  reserves: number,
  goalSavings: number,
  totalDebtPrincipal: number
): number {
  return roundMoney(reserves + goalSavings - totalDebtPrincipal)
}
