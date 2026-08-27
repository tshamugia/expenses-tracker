/**
 * Full-cycle acceptance test (Phase 4 §8 — the phase's main acceptance test).
 * Runs one complete month end-to-end through the real engines, then rolls the
 * conclusions into the next month's generation:
 *   generate → confirm → actuals (spend / debt / reserve) → windfall →
 *   close (completion + honest verdict + conclusions) → next-month generate.
 * No DB — this validates that the money math composes correctly across a cycle.
 */

import { describe, expect, it } from 'vitest'
import { generatePlan, type Conclusion, type PlanInput } from './plan-engine'
import { splitWindfall } from './windfall'
import { calcVerdict } from './verdict'
import { computeCompletionPct, proposeConclusions } from './month-close'
import type { IncomeForecast } from './income-forecast'

const forecast = (total: number): IncomeForecast => ({
  stableTotal: total,
  variableEstimate: 0,
  total,
  method: 'no_history',
  monthsOfHistory: 0,
})

function monthInput(conclusions: Conclusion[]): PlanInput {
  return {
    forecast: forecast(5000),
    mandatoryFixed: [{ label: 'Rent', amount: 1000, refId: 'exp-rent' }],
    variableTargets: [{ categoryId: 'cat-food', label: 'Food', amount: 400 }],
    debtInstallments: [{ debtId: 'debt-1', label: 'Loan', amount: 500 }],
    reserve: { goalId: 'reserve', label: 'Reserve', monthlyContribution: 300, remaining: 1000 },
    goals: [{ goalId: 'goal-car', label: 'Car', monthlyContribution: 200, remaining: 5000, priority: 2 }],
    conclusions,
    daysInMonth: 30,
  }
}

describe('monthly plan — full cycle', () => {
  it('runs generate → confirm → actuals → windfall → close → next month', () => {
    // 1. GENERATE (month 1)
    const m1 = generatePlan(monthInput([]))
    expect(m1.deficit).toBeNull()
    // 1000 + 400 + 500 + 300 + 200 = 2400 allocated → FREE 2600
    expect(m1.safeToSpendMonth).toBe(2600)

    // 2. CONFIRM — the plan is accepted as-is (FREE = forecast − rest)
    const planned = new Map(m1.allocations.map((a) => [a.refId ?? a.kind, a.planned]))
    expect(planned.get('cat-food')).toBe(400)

    // 3. ACTUALS during the month
    const actualFood = 452 // overspent the food target
    const debtPrincipalPaid = 180
    const reserveNet = 300 // funded the reserve as planned
    const goalsNet = 200

    // 4. WINDFALL — income came in 300 above forecast, split 50/30/20
    const windfall = splitWindfall(300, { debt: 50, goals: 30, free: 20 })
    expect(windfall).toEqual({ toDebt: 150, toGoals: 90, toFree: 60 })

    // 5. CLOSE — completion % and the honest verdict
    const closeLines = [
      { kind: 'MANDATORY', refId: 'exp-rent', label: 'Rent', planned: 1000, actual: 1000 },
      { kind: 'VARIABLE', refId: 'cat-food', label: 'Food', planned: 400, actual: actualFood },
      { kind: 'DEBT', refId: 'debt-1', label: 'Loan', planned: 500, actual: 500 },
      { kind: 'RESERVE', refId: 'reserve', label: 'Reserve', planned: 300, actual: 300 },
      { kind: 'GOAL', refId: 'goal-car', label: 'Car', planned: 200, actual: 200 },
      { kind: 'FREE', refId: null, label: 'Free', planned: 2600, actual: 900 },
    ]
    const completion = computeCompletionPct(closeLines)
    expect(completion).toBe(100) // every intentional tier hit its plan

    const verdict = calcVerdict({
      debtPrincipalPaid,
      reserveNet,
      goalsNet,
      newDebtPrincipal: 0,
    })
    expect(verdict.verdict).toBe('FORWARD')
    expect(verdict.netChange).toBe(680) // 180 + 300 + 200

    // 6. CONCLUSIONS — food overshot → propose raising its target
    const conclusions = proposeConclusions(
      closeLines
        .filter((l) => l.kind === 'VARIABLE')
        .map((l) => ({ refId: l.refId, label: l.label, planned: l.planned, actual: l.actual }))
    )
    expect(conclusions).toHaveLength(1)
    expect(conclusions[0]).toMatchObject({ type: 'raise_limit', categoryId: 'cat-food', delta: 50 })

    // 7. NEXT MONTH — conclusions feed the next generation; the food target rises
    const engineConclusions: Conclusion[] = conclusions.map((c) => ({
      type: 'raise_limit',
      categoryId: c.categoryId,
      delta: c.delta,
      note: c.note,
    }))
    const m2 = generatePlan(monthInput(engineConclusions))
    const food2 = m2.allocations.find((a) => a.refId === 'cat-food')
    expect(food2?.planned).toBe(450) // 400 + 50 from the conclusion
    // The extra 50 to food reduces FREE by 50 vs month 1
    expect(m2.safeToSpendMonth).toBe(2550)
  })

  it('surfaces a deficit and balances it by pausing the goal (deficit flow)', () => {
    const tight = monthInput([])
    tight.forecast = forecast(2300) // can't cover the full waterfall
    const draft = generatePlan(tight)
    expect(draft.deficit).not.toBeNull()

    // User pauses the car goal (frees 200) → re-run balances (2300 ≥ 2200)
    const resolved = generatePlan({ ...tight, goals: [] })
    expect(resolved.deficit).toBeNull()
    expect(resolved.safeToSpendMonth).toBe(100) // 2300 − (1000+400+500+300)
  })
})
