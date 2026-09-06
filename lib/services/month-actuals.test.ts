import { describe, expect, it, vi } from 'vitest'
import type { MonthActuals } from './month-actuals'
import type { SerializedAllocation, SerializedPlan } from '@/types/plan-types'

// month-actuals imports the prisma singleton at module load; mock it so the pure
// builders below can be imported without a DB. gatherMonthActuals (the DB-backed
// aggregator) is exercised via the plan-actions / plan-close integration tests.
vi.mock('@/lib/db/prisma', () => ({ default: {} }))

import {
  actualForAllocation,
  buildCloseLines,
  buildSetAside,
  computePlannedNetChange,
} from './month-actuals'

function emptyActuals(overrides: Partial<MonthActuals> = {}): MonthActuals {
  return {
    incomeTotal: 0,
    spendByCategory: new Map(),
    spendByExpense: new Map(),
    debtPaidByDebt: new Map(),
    debtPrincipalByDebt: new Map(),
    debtPrincipalPaidTotal: 0,
    contribByGoal: new Map(),
    reserveNet: 0,
    goalsNet: 0,
    newDebtPrincipal: 0,
    discretionarySpent: 0,
    categoryKind: new Map(),
    ...overrides,
  }
}

function alloc(partial: Partial<SerializedAllocation>): SerializedAllocation {
  return {
    id: partial.id ?? 'a',
    planId: 'plan-1',
    kind: partial.kind ?? 'FREE',
    refId: partial.refId ?? null,
    label: partial.label ?? 'x',
    planned: partial.planned ?? 0,
    actual: partial.actual ?? null,
  } as SerializedAllocation
}

describe('actualForAllocation', () => {
  const actuals = emptyActuals({
    debtPaidByDebt: new Map([['debt-1', 500]]),
    contribByGoal: new Map([['goal-1', 200]]),
    spendByCategory: new Map([['cat-1', 320], ['fixed-cat', 900]]),
    spendByExpense: new Map([['exp-1', 400]]),
    discretionarySpent: 275,
  })

  it('maps DEBT to the total paid on that debt', () => {
    expect(actualForAllocation(alloc({ kind: 'DEBT', refId: 'debt-1' }), actuals)).toBe(500)
  })
  it('maps GOAL / RESERVE to the goal contribution', () => {
    expect(actualForAllocation(alloc({ kind: 'GOAL', refId: 'goal-1' }), actuals)).toBe(200)
    expect(actualForAllocation(alloc({ kind: 'RESERVE', refId: 'goal-1' }), actuals)).toBe(200)
  })
  it('maps VARIABLE to category spend', () => {
    expect(actualForAllocation(alloc({ kind: 'VARIABLE', refId: 'cat-1' }), actuals)).toBe(320)
  })
  it('maps MANDATORY to category + recurring-expense spend combined', () => {
    expect(actualForAllocation(alloc({ kind: 'MANDATORY', refId: 'exp-1' }), actuals)).toBe(400)
    expect(actualForAllocation(alloc({ kind: 'MANDATORY', refId: 'fixed-cat' }), actuals)).toBe(900)
  })
  it('maps FREE to the discretionary spend', () => {
    expect(actualForAllocation(alloc({ kind: 'FREE', refId: null }), actuals)).toBe(275)
  })
  it('returns 0 for a ref that never moved money', () => {
    expect(actualForAllocation(alloc({ kind: 'DEBT', refId: 'missing' }), actuals)).toBe(0)
  })
})

describe('computePlannedNetChange', () => {
  it('sums only the debt/reserve/goal planned amounts (never MANDATORY/VARIABLE/FREE)', () => {
    const allocs = [
      alloc({ kind: 'MANDATORY', planned: 1000 }),
      alloc({ kind: 'DEBT', planned: 500 }),
      alloc({ kind: 'RESERVE', planned: 300 }),
      alloc({ kind: 'GOAL', planned: 200 }),
      alloc({ kind: 'VARIABLE', planned: 400 }),
      alloc({ kind: 'FREE', planned: 2000 }),
    ]
    expect(computePlannedNetChange(allocs)).toBe(1000) // 500 + 300 + 200
  })
})

describe('buildCloseLines', () => {
  it('pairs each allocation with its actual and signed delta %', () => {
    const allocs = [alloc({ kind: 'VARIABLE', refId: 'cat-1', label: 'Food', planned: 300 })]
    const actuals = emptyActuals({ spendByCategory: new Map([['cat-1', 360]]) })
    const [line] = buildCloseLines(allocs, actuals)
    expect(line).toMatchObject({ kind: 'VARIABLE', planned: 300, actual: 360, deltaPct: 20 })
  })
})

describe('buildSetAside', () => {
  const plan = { forecastIncome: 4000 } as SerializedPlan

  it('computes X, obligations, availability and per-goal achievement', () => {
    const allocs = [
      alloc({ kind: 'MANDATORY', planned: 1000 }),
      alloc({ kind: 'DEBT', planned: 500 }),
      alloc({ kind: 'RESERVE', refId: 'goal-res', label: 'Reserve', planned: 300 }),
      alloc({ kind: 'GOAL', refId: 'goal-lap', label: 'Laptop', planned: 500 }),
      alloc({ kind: 'FREE', planned: 1700 }),
    ]
    const actuals = emptyActuals({
      reserveNet: 300,
      goalsNet: 200,
      contribByGoal: new Map([['goal-res', 300], ['goal-lap', 200]]),
    })
    const result = buildSetAside(allocs, plan, actuals)

    expect(result.requiredSetAside).toBe(800) // 300 + 500
    expect(result.obligations).toBe(1500) // 1000 + 500
    expect(result.availableForGoals).toBe(2500) // 4000 − 1500
    expect(result.actualSetAside).toBe(500) // 300 + 200
    expect(result.achieved).toBe(false) // 500 < 800
    expect(result.feasible).toBe(true) // 800 ≤ 2500
    expect(result.shortfall).toBe(0)

    const reserveLine = result.lines.find((l) => l.refId === 'goal-res')
    const laptopLine = result.lines.find((l) => l.refId === 'goal-lap')
    expect(reserveLine).toMatchObject({ required: 300, saved: 300, achieved: true })
    expect(laptopLine).toMatchObject({ required: 500, saved: 200, achieved: false })
  })

  it('flags infeasible with a shortfall when X exceeds the money left after obligations', () => {
    const allocs = [
      alloc({ kind: 'MANDATORY', planned: 3500 }),
      alloc({ kind: 'GOAL', refId: 'g', label: 'Big', planned: 900 }),
      alloc({ kind: 'FREE', planned: 0 }),
    ]
    const result = buildSetAside(allocs, plan, emptyActuals())
    expect(result.availableForGoals).toBe(500) // 4000 − 3500
    expect(result.requiredSetAside).toBe(900)
    expect(result.feasible).toBe(false)
    expect(result.shortfall).toBe(400) // 900 − 500
  })
})
