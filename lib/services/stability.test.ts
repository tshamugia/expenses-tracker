import { describe, expect, it } from 'vitest'
import {
  currentStabilityStage,
  debtFreeProjection,
  netPosition,
} from './stability'

const FROM = new Date(2026, 8, 1) // 1 Sep 2026

describe('currentStabilityStage', () => {
  const reserve = { saved: 0, oneMonthTarget: 2000, threeMonthTarget: 6000 }

  it('is stage 0 below the 500₾ initial buffer', () => {
    expect(currentStabilityStage({ ...reserve, saved: 0 }, 3000)).toBe(0)
    expect(currentStabilityStage({ ...reserve, saved: 499.99 }, 3000)).toBe(0)
  })

  it('is stage 1 after the buffer, before the one-month reserve', () => {
    expect(currentStabilityStage({ ...reserve, saved: 500 }, 3000)).toBe(1)
    expect(currentStabilityStage({ ...reserve, saved: 1999 }, 3000)).toBe(1)
  })

  it('is stage 2 (debt-free) once the one-month reserve is met but debt remains', () => {
    expect(currentStabilityStage({ ...reserve, saved: 2000 }, 3000)).toBe(2)
  })

  it('is stage 3 (three-month reserve) when debt-free but reserve not full', () => {
    expect(currentStabilityStage({ ...reserve, saved: 2000 }, 0)).toBe(3)
    expect(currentStabilityStage({ ...reserve, saved: 5999 }, 0)).toBe(3)
  })

  it('is stage 4 (achieved) when the three-month reserve is full and debt-free', () => {
    expect(currentStabilityStage({ ...reserve, saved: 6000 }, 0)).toBe(4)
  })
})

describe('debtFreeProjection', () => {
  it('reports the paid percentage against the original total', () => {
    const p = debtFreeProjection(
      [{ originalPrincipal: 10000, remainingPrincipal: 4000, monthlyPrincipalAvg: 500 }],
      FROM
    )
    expect(p.paidPct).toBe(60)
    expect(p.remaining).toBe(4000)
    // 4000 / 500 = 8 months → 1 May 2027
    expect(p.projectedDate).toEqual(new Date(2027, 4, 1))
  })

  it('returns a null date when nothing is being paid (pace 0)', () => {
    const p = debtFreeProjection(
      [{ originalPrincipal: 10000, remainingPrincipal: 4000, monthlyPrincipalAvg: 0 }],
      FROM
    )
    expect(p.projectedDate).toBeNull()
  })

  it('treats zero total original as fully paid', () => {
    const p = debtFreeProjection([], FROM)
    expect(p.paidPct).toBe(100)
    expect(p.remaining).toBe(0)
    expect(p.projectedDate).toEqual(FROM)
  })

  it('aggregates across multiple debts', () => {
    const p = debtFreeProjection(
      [
        { originalPrincipal: 5000, remainingPrincipal: 2000, monthlyPrincipalAvg: 400 },
        { originalPrincipal: 5000, remainingPrincipal: 2000, monthlyPrincipalAvg: 100 },
      ],
      FROM
    )
    expect(p.paidPct).toBe(60)
    expect(p.remaining).toBe(4000)
    // 4000 / 500 = 8 months
    expect(p.projectedDate).toEqual(new Date(2027, 4, 1))
  })
})

describe('netPosition', () => {
  it('sums savings minus debt', () => {
    expect(netPosition(2000, 1500, 3000)).toBe(500)
  })

  it('can be negative when debt outweighs savings', () => {
    expect(netPosition(500, 0, 4000)).toBe(-3500)
  })
})
