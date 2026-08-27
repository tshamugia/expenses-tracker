import { describe, expect, it } from 'vitest'
import { computeCompletionPct, deltaPct, proposeConclusions } from './month-close'

describe('computeCompletionPct', () => {
  it('is 100 when every intentional line is fully executed', () => {
    const pct = computeCompletionPct([
      { kind: 'DEBT', refId: 'd1', label: 'Loan', planned: 500, actual: 500 },
      { kind: 'RESERVE', refId: 'r', label: 'Reserve', planned: 300, actual: 300 },
      { kind: 'FREE', refId: null, label: 'Free', planned: 1000, actual: 400 },
    ])
    expect(pct).toBe(100)
  })

  it('caps each line at its planned amount (overspend cannot exceed 100)', () => {
    const pct = computeCompletionPct([
      { kind: 'DEBT', refId: 'd1', label: 'Loan', planned: 500, actual: 900 },
    ])
    expect(pct).toBe(100)
  })

  it('reflects partial execution', () => {
    const pct = computeCompletionPct([
      { kind: 'DEBT', refId: 'd1', label: 'Loan', planned: 500, actual: 250 },
      { kind: 'GOAL', refId: 'g', label: 'Car', planned: 500, actual: 500 },
    ])
    expect(pct).toBe(75)
  })

  it('is 100 when there is nothing to execute', () => {
    expect(computeCompletionPct([{ kind: 'FREE', refId: null, label: 'Free', planned: 800, actual: 0 }])).toBe(100)
    expect(computeCompletionPct([])).toBe(100)
  })
})

describe('deltaPct', () => {
  it('is the signed deviation of actual from planned', () => {
    expect(deltaPct(400, 500)).toBe(25)
    expect(deltaPct(400, 300)).toBe(-25)
  })
  it('is null when nothing was planned', () => {
    expect(deltaPct(0, 100)).toBeNull()
  })
})

describe('proposeConclusions', () => {
  it('proposes a limit raise for an overspent variable category', () => {
    const c = proposeConclusions([
      { refId: 'cat-food', label: 'Food', planned: 400, actual: 452 },
    ])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ type: 'raise_limit', categoryId: 'cat-food', delta: 50 })
  })

  it('ignores categories that stayed within plan', () => {
    expect(
      proposeConclusions([{ refId: 'cat-food', label: 'Food', planned: 400, actual: 380 }])
    ).toHaveLength(0)
  })

  it('skips lines without a category reference', () => {
    expect(
      proposeConclusions([{ refId: null, label: 'Misc', planned: 100, actual: 300 }])
    ).toHaveLength(0)
  })
})
