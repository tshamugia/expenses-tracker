import { describe, expect, it } from 'vitest'
import type { PlanInput } from '@/lib/services/plan-engine'
import { computeGoalWhatIf } from './goal-plan-impact'

function makeInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    forecast: {
      stableTotal: 3000,
      variableEstimate: 0,
      total: 3000,
      method: 'average_discounted',
      monthsOfHistory: 6,
    },
    mandatoryFixed: [],
    variableTargets: [],
    debtInstallments: [],
    reserve: null,
    goals: [],
    conclusions: [],
    daysInMonth: 30,
    ...overrides,
  }
}

describe('computeGoalWhatIf', () => {
  it('reduces Safe-to-Spend by the goal contribution', () => {
    const input = makeInput({ mandatoryFixed: [{ label: 'Rent', amount: 1000 }] })
    const r = computeGoalWhatIf(input, {
      monthlyContribution: 500,
      remaining: 500,
      priority: 2,
    })
    expect(r.safeBefore).toBe(2000)
    expect(r.safeAfter).toBe(1500)
    expect(r.deltaMonthly).toBe(500)
  })

  it('caps the impact at the goal remaining', () => {
    const input = makeInput({ mandatoryFixed: [{ label: 'Rent', amount: 1000 }] })
    const r = computeGoalWhatIf(input, {
      monthlyContribution: 500,
      remaining: 200,
      priority: 2,
    })
    expect(r.safeAfter).toBe(1800)
    expect(r.deltaMonthly).toBe(200)
  })

  it('accounts for goals already in the plan', () => {
    const input = makeInput({
      mandatoryFixed: [{ label: 'Rent', amount: 2000 }],
      goals: [
        {
          goalId: 'g1',
          label: 'Existing',
          monthlyContribution: 500,
          remaining: 500,
          priority: 2,
        },
      ],
    })
    const r = computeGoalWhatIf(input, {
      monthlyContribution: 500,
      remaining: 500,
      priority: 3,
    })
    expect(r.safeBefore).toBe(500)
    expect(r.safeAfter).toBe(0)
    expect(r.deltaMonthly).toBe(500)
  })

  it('reads as no impact when Safe-to-Spend is already zero (deficit)', () => {
    const input = makeInput({ mandatoryFixed: [{ label: 'Rent', amount: 3000 }] })
    const r = computeGoalWhatIf(input, {
      monthlyContribution: 500,
      remaining: 500,
      priority: 2,
    })
    expect(r.safeBefore).toBe(0)
    expect(r.safeAfter).toBe(0)
    expect(r.deltaMonthly).toBe(0)
  })

  it('has no effect for a goal with no planned monthly contribution', () => {
    const input = makeInput({ mandatoryFixed: [{ label: 'Rent', amount: 1000 }] })
    const r = computeGoalWhatIf(input, {
      monthlyContribution: 0,
      remaining: 500,
      priority: 2,
    })
    expect(r.deltaMonthly).toBe(0)
    expect(r.safeAfter).toBe(r.safeBefore)
  })
})
