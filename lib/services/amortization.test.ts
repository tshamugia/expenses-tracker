import { describe, expect, it } from 'vitest'
import {
  buildSchedule,
  buildScheduleFromPayment,
  calcAnnuityPayment,
  calcTermMonths,
  rankDebtsForExtra,
  roundMoney,
  simulateExtraMonthly,
  simulateLumpSum,
  summarizeSchedule,
  type ScheduleRow,
} from './amortization'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

const sum = (rows: ScheduleRow[], key: keyof ScheduleRow) =>
  roundMoney(rows.reduce((s, r) => s + (r[key] as number), 0))

describe('roundMoney', () => {
  it('rounds to 2 decimals half up', () => {
    expect(roundMoney(249.615)).toBe(249.62)
    expect(roundMoney(0.005)).toBe(0.01)
    expect(roundMoney(100)).toBe(100)
  })
})

describe('calcAnnuityPayment', () => {
  it('matches the bank-calculator benchmark: 5000 @ 18% / 24m → 249.62', () => {
    expect(calcAnnuityPayment(5000, 18, 24)).toBe(249.62)
  })

  it('0% rate → payment = principal / term', () => {
    expect(calcAnnuityPayment(1200, 0, 12)).toBe(100)
    expect(calcAnnuityPayment(5000, 0, 24)).toBe(208.33)
  })

  it('throws on a non-positive term', () => {
    expect(() => calcAnnuityPayment(5000, 18, 0)).toThrow()
  })
})

describe('calcTermMonths', () => {
  it('inverts calcAnnuityPayment (payment 249.62 @ 18% → 24 months)', () => {
    expect(calcTermMonths(5000, 18, 249.62)).toBe(24)
  })

  it('0% rate → ceil(principal / payment)', () => {
    expect(calcTermMonths(1000, 0, 100)).toBe(10)
    expect(calcTermMonths(1000, 0, 99)).toBe(11)
  })

  it('rounds a partial final month up', () => {
    // 5000 @ 18% at 300/mo amortizes in ~19.3 months → 20
    expect(calcTermMonths(5000, 18, 300)).toBe(20)
  })

  it('throws when the payment ≤ first-month interest (never amortizes)', () => {
    // first-month interest on 5000 @ 18% is 75
    expect(() => calcTermMonths(5000, 18, 75)).toThrow(/never be paid off/i)
    expect(() => calcTermMonths(5000, 18, 50)).toThrow()
  })
})

describe('buildSchedule', () => {
  const schedule = buildSchedule({
    principal: 5000,
    annualRatePct: 18,
    termMonths: 24,
    firstPaymentDate: D(2026, 1, 15),
  })

  it('produces exactly termMonths rows', () => {
    expect(schedule).toHaveLength(24)
    expect(schedule[0].seq).toBe(1)
    expect(schedule[23].seq).toBe(24)
  })

  it('final remainingPrincipal is exactly 0', () => {
    expect(schedule[23].remainingPrincipal).toBe(0)
  })

  it('principalPart sums to the original principal', () => {
    expect(sum(schedule, 'principalPart')).toBe(5000)
  })

  it('interest + principal equals payment on every row', () => {
    for (const row of schedule) {
      expect(roundMoney(row.interestPart + row.principalPart)).toBe(row.payment)
    }
  })

  it('sum of payments equals sum of interest + sum of principal', () => {
    expect(sum(schedule, 'payment')).toBe(
      roundMoney(sum(schedule, 'interestPart') + sum(schedule, 'principalPart'))
    )
  })

  it('first row splits into interest 75 / principal 174.62', () => {
    expect(schedule[0].interestPart).toBe(75)
    expect(schedule[0].principalPart).toBe(174.62)
  })

  it('advances dueDate one month per row, clamping month-ends (Jan 31 → Feb 28)', () => {
    const monthEnd = buildSchedule({
      principal: 1000,
      annualRatePct: 12,
      termMonths: 3,
      firstPaymentDate: D(2026, 1, 31),
    })
    expect(monthEnd[0].dueDate).toEqual(D(2026, 1, 31))
    // 2026 is not a leap year → Feb 28 (date-fns addMonths clamps)
    expect(monthEnd[1].dueDate).toEqual(D(2026, 2, 28))
    expect(monthEnd[2].dueDate).toEqual(D(2026, 3, 31))
  })

  it('handles a 0% loan (equal principal, no interest)', () => {
    const zero = buildSchedule({
      principal: 1200,
      annualRatePct: 0,
      termMonths: 12,
      firstPaymentDate: D(2026, 1, 1),
    })
    expect(zero).toHaveLength(12)
    expect(sum(zero, 'interestPart')).toBe(0)
    expect(sum(zero, 'principalPart')).toBe(1200)
    expect(zero[11].remainingPrincipal).toBe(0)
  })
})

describe('buildScheduleFromPayment', () => {
  it('regular installments keep the given payment, last row clears the balance', () => {
    const schedule = buildScheduleFromPayment({
      principal: 5000,
      annualRatePct: 18,
      monthlyPayment: 300,
      firstPaymentDate: D(2026, 1, 15),
    })
    // 5000 @ 18% at 300/mo → 20 months (matches calcTermMonths)
    expect(schedule).toHaveLength(20)
    expect(schedule[0].payment).toBe(300)
    expect(schedule[schedule.length - 1].remainingPrincipal).toBe(0)
    expect(sum(schedule, 'principalPart')).toBe(5000)
    // last installment is the smaller remainder
    expect(schedule[schedule.length - 1].payment).toBeLessThanOrEqual(300)
  })

  it('throws when the payment never amortizes the balance', () => {
    expect(() =>
      buildScheduleFromPayment({
        principal: 5000,
        annualRatePct: 18,
        monthlyPayment: 70,
        firstPaymentDate: D(2026, 1, 15),
      })
    ).toThrow(/never be paid off/i)
  })
})

describe('summarizeSchedule', () => {
  it('totals interest, principal and end date', () => {
    const schedule = buildSchedule({
      principal: 5000,
      annualRatePct: 18,
      termMonths: 24,
      firstPaymentDate: D(2026, 1, 15),
    })
    const summary = summarizeSchedule(schedule)
    expect(summary.totalPrincipal).toBe(5000)
    expect(summary.totalPaid).toBe(
      roundMoney(summary.totalPrincipal + summary.totalInterest)
    )
    expect(summary.totalInterest).toBeGreaterThan(900)
    expect(summary.totalInterest).toBeLessThan(1000)
    expect(summary.endDate).toEqual(D(2027, 12, 15))
  })

  it('returns null end date for an empty schedule', () => {
    expect(summarizeSchedule([]).endDate).toBeNull()
  })
})

describe('simulateExtraMonthly', () => {
  const base = buildSchedule({
    principal: 5000,
    annualRatePct: 18,
    termMonths: 24,
    firstPaymentDate: D(2026, 1, 15),
  })

  it('extra = 0 changes nothing', () => {
    const result = simulateExtraMonthly(base, 1, 0, 18)
    expect(result.monthsSaved).toBe(0)
    expect(result.interestSaved).toBe(0)
  })

  it('a large extra shortens the term sharply and saves interest', () => {
    const result = simulateExtraMonthly(base, 1, 200, 18)
    expect(result.monthsSaved).toBeGreaterThan(9)
    expect(result.interestSaved).toBeGreaterThan(0)
    expect(result.newSchedule[result.newSchedule.length - 1].remainingPrincipal).toBe(0)
  })

  it('interestSaved equals old total interest minus new total interest', () => {
    const result = simulateExtraMonthly(base, 1, 100, 18)
    const oldInterest = sum(base, 'interestPart')
    const newInterest = sum(result.newSchedule, 'interestPart')
    expect(result.interestSaved).toBe(roundMoney(oldInterest - newInterest))
  })

  it('applies the extra only from the given seq onward (paid rows untouched)', () => {
    const result = simulateExtraMonthly(base, 5, 300, 18)
    expect(result.newSchedule.slice(0, 4)).toEqual(base.slice(0, 4))
  })
})

describe('simulateLumpSum', () => {
  const base = buildSchedule({
    principal: 5000,
    annualRatePct: 18,
    termMonths: 24,
    firstPaymentDate: D(2026, 1, 15),
  })

  it('a lump ≥ remaining principal closes the debt that same month', () => {
    const result = simulateLumpSum(base, 1, 6000, 18)
    // only the current row remains
    expect(result.newSchedule).toHaveLength(1)
    expect(result.newSchedule[0].remainingPrincipal).toBe(0)
    expect(result.monthsSaved).toBe(23)
  })

  it('a partial lump shortens the term and saves interest', () => {
    const result = simulateLumpSum(base, 1, 2000, 18)
    expect(result.monthsSaved).toBeGreaterThan(0)
    expect(result.interestSaved).toBeGreaterThan(0)
    expect(result.newSchedule[result.newSchedule.length - 1].remainingPrincipal).toBe(0)
  })

  it('keeps the installment amount unchanged after a partial lump', () => {
    const result = simulateLumpSum(base, 1, 2000, 18)
    // regular installments (all but the last) keep the annuity amount
    expect(result.newSchedule[0].payment).toBe(base[0].payment)
  })
})

describe('rankDebtsForExtra', () => {
  const debts = [
    { id: 'a', annualRatePct: 12, remainingPrincipal: 3000 },
    { id: 'b', annualRatePct: 24, remainingPrincipal: 8000 },
    { id: 'c', annualRatePct: 18, remainingPrincipal: 1000 },
  ]

  it('avalanche ranks by highest rate first', () => {
    expect(rankDebtsForExtra(debts, 'avalanche').map((d) => d.id)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  it('snowball ranks by smallest balance first', () => {
    expect(rankDebtsForExtra(debts, 'snowball').map((d) => d.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('keeps a stable order on ties', () => {
    const tied = [
      { id: 'x', annualRatePct: 18, remainingPrincipal: 5000 },
      { id: 'y', annualRatePct: 18, remainingPrincipal: 2000 },
      { id: 'z', annualRatePct: 18, remainingPrincipal: 2000 },
    ]
    expect(rankDebtsForExtra(tied, 'avalanche').map((d) => d.id)).toEqual([
      'x',
      'y',
      'z',
    ])
    expect(rankDebtsForExtra(tied, 'snowball').map((d) => d.id)).toEqual([
      'y',
      'z',
      'x',
    ])
  })
})
