import { describe, expect, it } from 'vitest'
import { generatePlan, type PlanInput } from './plan-engine'
import type { IncomeForecast } from './income-forecast'

const forecast = (total: number): IncomeForecast => ({
  stableTotal: total,
  variableEstimate: 0,
  total,
  method: 'no_history',
  monthsOfHistory: 0,
})

const baseInput = (over: Partial<PlanInput> = {}): PlanInput => ({
  forecast: forecast(5000),
  mandatoryFixed: [{ label: 'Rent', amount: 1000 }],
  variableTargets: [{ categoryId: 'cat-food', label: 'Food', amount: 400 }],
  debtInstallments: [{ debtId: 'debt-1', label: 'Loan', amount: 500 }],
  reserve: { goalId: 'reserve', label: 'Reserve', monthlyContribution: 300, remaining: 1000 },
  goals: [
    { goalId: 'goal-car', label: 'Car', monthlyContribution: 200, remaining: 5000, priority: 2 },
  ],
  conclusions: [],
  daysInMonth: 30,
  ...over,
})

const sum = (nums: number[]) => Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100

describe('generatePlan — waterfall', () => {
  it('fills every tier and FREE is the remainder; allocations sum to forecast exactly', () => {
    const r = generatePlan(baseInput())
    // 1000 + 400 + 500 + 300 + 200 = 2400 allocated; FREE = 2600
    expect(r.safeToSpendMonth).toBe(2600)
    expect(r.deficit).toBeNull()
    const total = sum(r.allocations.map((a) => a.planned))
    expect(total).toBe(5000)
    const free = r.allocations.find((a) => a.kind === 'FREE')
    expect(free?.planned).toBe(2600)
  })

  it('orders the tiers strictly and always ends with FREE', () => {
    const r = generatePlan(baseInput())
    const kinds = r.allocations.map((a) => a.kind)
    expect(kinds).toEqual(['MANDATORY', 'VARIABLE', 'DEBT', 'RESERVE', 'GOAL', 'FREE'])
  })

  it('places the reserve before goals while it still needs filling', () => {
    const r = generatePlan(baseInput())
    const reserveIdx = r.allocations.findIndex((a) => a.kind === 'RESERVE')
    const goalIdx = r.allocations.findIndex((a) => a.kind === 'GOAL')
    expect(reserveIdx).toBeLessThan(goalIdx)
  })

  it('skips a filled reserve (remaining 0) and moves on to goals', () => {
    const r = generatePlan(
      baseInput({
        reserve: { goalId: 'reserve', label: 'Reserve', monthlyContribution: 300, remaining: 0 },
      })
    )
    expect(r.allocations.some((a) => a.kind === 'RESERVE')).toBe(false)
    expect(r.allocations.some((a) => a.kind === 'GOAL')).toBe(true)
  })

  it('caps a goal contribution at its remaining (partial final month)', () => {
    const r = generatePlan(
      baseInput({
        goals: [
          { goalId: 'goal-car', label: 'Car', monthlyContribution: 500, remaining: 200, priority: 2 },
        ],
      })
    )
    const goal = r.allocations.find((a) => a.kind === 'GOAL')
    expect(goal?.planned).toBe(200)
  })

  it('computes safeToSpendDay as FREE / daysInMonth rounded down', () => {
    const r = generatePlan(baseInput({ forecast: forecast(2500), daysInMonth: 30 }))
    // allocated 2400 → FREE 100 → 100/30 = 3.333 → 3.33
    expect(r.safeToSpendMonth).toBe(100)
    expect(r.safeToSpendDay).toBe(3.33)
  })
})

describe('generatePlan — conclusions', () => {
  it('raises a VARIABLE target by a raise_limit conclusion', () => {
    const r = generatePlan(
      baseInput({
        conclusions: [{ type: 'raise_limit', categoryId: 'cat-food', delta: 50, note: 'over 3 months' }],
      })
    )
    const food = r.allocations.find((a) => a.refId === 'cat-food')
    expect(food?.planned).toBe(450)
  })
})

describe('generatePlan — deficit', () => {
  it('flags a deficit at the GOAL tier with the right shortfall', () => {
    const r = generatePlan(
      baseInput({
        forecast: forecast(2500),
        goals: [
          { goalId: 'goal-car', label: 'Car', monthlyContribution: 500, remaining: 5000, priority: 2 },
        ],
      })
    )
    // 1000+400+500+300 = 2200 fits; +500 goal → 2700 > 2500 → short 200
    expect(r.deficit).not.toBeNull()
    expect(r.deficit?.failedAtKind).toBe('GOAL')
    expect(r.deficit?.shortfall).toBe(200)
    // FREE never goes negative
    expect(r.safeToSpendMonth).toBe(0)
    expect(r.allocations.find((a) => a.kind === 'FREE')?.planned).toBe(0)
    // Options are offered
    expect(r.deficit?.options.length).toBeGreaterThan(0)
  })

  it('flags a deficit at MANDATORY when income cannot even cover the basics', () => {
    const r = generatePlan(
      baseInput({
        forecast: forecast(800),
        mandatoryFixed: [{ label: 'Rent', amount: 1000 }],
        variableTargets: [],
        debtInstallments: [],
        reserve: null,
        goals: [],
      })
    )
    expect(r.deficit?.failedAtKind).toBe('MANDATORY')
    expect(r.deficit?.shortfall).toBe(200)
    expect(r.safeToSpendMonth).toBe(0)
  })

  it('offers pausing the lowest-priority goal first', () => {
    const r = generatePlan(
      baseInput({
        forecast: forecast(2000),
        goals: [
          { goalId: 'goal-hi', label: 'High', monthlyContribution: 300, remaining: 5000, priority: 2 },
          { goalId: 'goal-lo', label: 'Low', monthlyContribution: 300, remaining: 5000, priority: 5 },
        ],
      })
    )
    const firstPause = r.deficit?.options.find((o) => o.type === 'pause_goal')
    expect(firstPause && 'goalId' in firstPause ? firstPause.goalId : null).toBe('goal-lo')
  })
})
