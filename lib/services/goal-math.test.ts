import { describe, expect, it } from 'vitest'
import {
  calcGoalProgress,
  calcMandatoryMonthlyExpense,
  calcReserveTarget,
  projectedCompletionDate,
  requiredMonthlyContribution,
  type GoalMathInput,
} from './goal-math'

const TODAY = new Date(2026, 7, 24) // 24 Aug 2026

describe('requiredMonthlyContribution', () => {
  it('divides the remaining evenly across the months left', () => {
    expect(requiredMonthlyContribution(1500, 4)).toBe(375)
  })

  it('returns the whole remaining in one month when the deadline is now or past', () => {
    expect(requiredMonthlyContribution(1500, 0)).toBe(1500)
    expect(requiredMonthlyContribution(1500, -3)).toBe(1500)
  })

  it('returns 0 once nothing remains', () => {
    expect(requiredMonthlyContribution(0, 6)).toBe(0)
    expect(requiredMonthlyContribution(-50, 6)).toBe(0)
  })

  it('rounds to 2 decimals (half up)', () => {
    expect(requiredMonthlyContribution(1000, 3)).toBe(333.33)
  })
})

describe('projectedCompletionDate', () => {
  it('returns null for a zero or negative contribution', () => {
    expect(projectedCompletionDate(1000, 0, TODAY)).toBeNull()
    expect(projectedCompletionDate(1000, -10, TODAY)).toBeNull()
  })

  it('reaches the goal now when nothing remains', () => {
    expect(projectedCompletionDate(0, 100, TODAY)).toEqual(TODAY)
  })

  it('uses exact division when it divides evenly', () => {
    // 1000 / 250 = 4 months exactly
    expect(projectedCompletionDate(1000, 250, TODAY)).toEqual(
      new Date(2026, 11, 24)
    )
  })

  it('ceils a partial final month', () => {
    // 1000 / 300 = 3.33 → 4 months
    expect(projectedCompletionDate(1000, 300, TODAY)).toEqual(
      new Date(2026, 11, 24)
    )
  })
})

describe('calcGoalProgress', () => {
  const goal = (over: Partial<GoalMathInput> = {}): GoalMathInput => ({
    targetAmount: 1500,
    targetDate: null,
    monthlyContribution: null,
    ...over,
  })

  it('marks a goal achieved and caps percent at 100', () => {
    const p = calcGoalProgress(
      goal({ targetDate: new Date(2026, 11, 1) }),
      [{ amount: 1600 }],
      TODAY
    )
    expect(p.status).toBe('achieved')
    expect(p.percent).toBe(100)
    expect(p.saved).toBe(1600)
    expect(p.remaining).toBe(0)
  })

  it('sums withdrawals (negative contributions) correctly', () => {
    const p = calcGoalProgress(
      goal({ monthlyContribution: 200 }),
      [{ amount: 500 }, { amount: 300 }, { amount: -200 }],
      TODAY
    )
    expect(p.saved).toBe(600)
    expect(p.remaining).toBe(900)
    expect(p.percent).toBe(40)
  })

  it('reports no_plan when there is neither a date nor a contribution', () => {
    const p = calcGoalProgress(goal(), [{ amount: 100 }], TODAY)
    expect(p.status).toBe('no_plan')
    expect(p.requiredMonthly).toBeNull()
    expect(p.projectedDate).toBeNull()
  })

  it('reports no_plan when the target is not set yet (reserve, 0 target)', () => {
    const p = calcGoalProgress(goal({ targetAmount: 0 }), [], TODAY)
    expect(p.status).toBe('no_plan')
    expect(p.percent).toBe(0)
  })

  it('is on_track when the plan meets the deadline', () => {
    // remaining 1500 over 4 months → needs 375; plan is exactly 375
    const p = calcGoalProgress(
      goal({ targetDate: new Date(2026, 11, 24), monthlyContribution: 375 }),
      [],
      TODAY
    )
    expect(p.status).toBe('on_track')
    expect(p.requiredMonthly).toBe(375)
    expect(p.behindAdvice).toBeUndefined()
  })

  it('is behind with advice whose increaseMonthlyBy makes the deadline fit exactly', () => {
    // Fell behind: only 250/mo planned but 375 needed to hit the deadline
    const p = calcGoalProgress(
      goal({ targetDate: new Date(2026, 11, 24), monthlyContribution: 250 }),
      [],
      TODAY
    )
    expect(p.status).toBe('behind')
    expect(p.requiredMonthly).toBe(375)
    expect(p.behindAdvice).toBeDefined()
    // 250 + 125 = 375 → exactly hits the deadline
    expect(p.behindAdvice!.increaseMonthlyBy).toBe(125)
    expect(p.monthsLeft).toBe(4)
    // …or keep 250/mo and finish later: 1500/250 = 6 months → Feb 2027
    expect(p.behindAdvice!.orMoveDateTo).toEqual(new Date(2027, 1, 24))
  })

  it('is behind when the deadline has passed and the goal is unmet', () => {
    const p = calcGoalProgress(
      goal({ targetDate: new Date(2026, 6, 1), monthlyContribution: 100 }),
      [{ amount: 100 }],
      TODAY
    )
    expect(p.status).toBe('behind')
  })

  it('projects a date and stays on_track with a contribution but no deadline', () => {
    const p = calcGoalProgress(
      goal({ monthlyContribution: 500 }),
      [{ amount: 500 }],
      TODAY
    )
    expect(p.status).toBe('on_track')
    // remaining 1000 / 500 = 2 months
    expect(p.projectedDate).toEqual(new Date(2026, 9, 24))
    expect(p.requiredMonthly).toBeNull()
  })
})

describe('calcReserveTarget', () => {
  it('multiplies the mandatory monthly by the stage', () => {
    expect(calcReserveTarget(2100, 1)).toBe(2100)
    expect(calcReserveTarget(2100, 3)).toBe(6300)
  })

  it('is 0 for a brand-new user with no mandatory expenses', () => {
    expect(calcReserveTarget(0, 1)).toBe(0)
    expect(calcReserveTarget(0, 3)).toBe(0)
  })
})

describe('calcMandatoryMonthlyExpense', () => {
  it('sums fixed expenses and the 3-month FIXED-category average', () => {
    expect(calcMandatoryMonthlyExpense(1200, 900)).toBe(2100)
  })

  it('floors negative inputs at 0', () => {
    expect(calcMandatoryMonthlyExpense(-100, 900)).toBe(900)
    expect(calcMandatoryMonthlyExpense(0, 0)).toBe(0)
  })
})
