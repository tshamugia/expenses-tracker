import { describe, expect, it } from 'vitest'
import { calcVerdict } from './verdict'

describe('calcVerdict', () => {
  it('is FORWARD when every component moves the position up', () => {
    const r = calcVerdict({
      debtPrincipalPaid: 180,
      reserveNet: 150,
      goalsNet: 80,
      newDebtPrincipal: 0,
    })
    expect(r.netChange).toBe(410)
    expect(r.verdict).toBe('FORWARD')
    expect(r.components).toEqual({
      debt: 180,
      reserve: 150,
      goals: 80,
      newDebt: 0,
    })
  })

  it('is BACK when reserve withdrawals outweigh everything (honesty test)', () => {
    // Plan may be "100% done", but net worth still fell.
    const r = calcVerdict({
      debtPrincipalPaid: 100,
      reserveNet: -300,
      goalsNet: 50,
      newDebtPrincipal: 0,
    })
    expect(r.netChange).toBe(-150)
    expect(r.verdict).toBe('BACK')
  })

  it('is BACK when new debt exceeds principal paid', () => {
    const r = calcVerdict({
      debtPrincipalPaid: 100,
      reserveNet: 0,
      goalsNet: 0,
      newDebtPrincipal: 500,
    })
    expect(r.netChange).toBe(-400)
    expect(r.verdict).toBe('BACK')
  })

  it('is FLAT within ±5₾ of zero', () => {
    expect(calcVerdict({ debtPrincipalPaid: 5, reserveNet: 0, goalsNet: 0, newDebtPrincipal: 0 }).verdict).toBe('FLAT')
    expect(calcVerdict({ debtPrincipalPaid: 0, reserveNet: -5, goalsNet: 0, newDebtPrincipal: 0 }).verdict).toBe('FLAT')
    expect(calcVerdict({ debtPrincipalPaid: 6, reserveNet: 0, goalsNet: 0, newDebtPrincipal: 0 }).verdict).toBe('FORWARD')
    expect(calcVerdict({ debtPrincipalPaid: 0, reserveNet: 0, goalsNet: 0, newDebtPrincipal: 6 }).verdict).toBe('BACK')
  })
})
