/**
 * Month-close aggregation (Phase 4, PRD §7.6 / R4).
 * Pure functions: no DB, no auth — fully unit-testable. The verdict itself lives
 * in verdict.ts; here we turn plan-vs-actual lines into a completion percentage
 * and propose conclusions for the next plan.
 */

import { roundMoney } from '@/lib/services/amortization'
import type { PlanConclusion } from '@/types/plan-types'

export type CloseLine = {
  kind: string
  refId: string | null
  label: string
  planned: number
  actual: number
}

/**
 * Plan completion % over the intentional tiers (everything but FREE). Each line
 * is capped at its planned amount so overspending one line can't inflate the
 * total. No planned amount at all → 100 (a plan with nothing to execute is
 * trivially complete).
 */
export function computeCompletionPct(lines: CloseLine[]): number {
  const relevant = lines.filter((l) => l.kind !== 'FREE')
  const planned = relevant.reduce((sum, l) => sum + l.planned, 0)
  if (planned <= 0) return 100
  const done = relevant.reduce(
    (sum, l) => sum + Math.min(l.actual, l.planned),
    0
  )
  return roundMoney(Math.min(100, (done / planned) * 100))
}

/** Signed delta % of actual vs planned (null when nothing was planned). */
export function deltaPct(planned: number, actual: number): number | null {
  if (planned <= 0) return null
  return roundMoney(((actual - planned) / planned) * 100)
}

/**
 * Propose conclusions for next month's plan. A VARIABLE category whose actual
 * spend overshot its target is proposed for a limit raise, by the overage
 * (rounded to the nearest 10₾ for a cleaner number). The user opts in per line
 * at close time.
 */
export function proposeConclusions(
  variableLines: { refId: string | null; label: string; planned: number; actual: number }[]
): PlanConclusion[] {
  const conclusions: PlanConclusion[] = []
  for (const line of variableLines) {
    if (!line.refId) continue
    const overage = line.actual - line.planned
    if (overage <= 0) continue
    const delta = Math.max(10, Math.round(overage / 10) * 10)
    conclusions.push({
      type: 'raise_limit',
      categoryId: line.refId,
      categoryName: line.label,
      delta,
      note: 'over plan this month',
    })
  }
  return conclusions
}
