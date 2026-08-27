import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    incomeSource: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))

import {
  MAX_ACCRUAL_MONTHS_BACK,
  accrualDateFor,
  accrualKey,
  accrueStableIncomeForUser,
  computeDueAccruals,
  type StableSourceForAccrual,
} from './income-accrual'

const NOW = new Date(2026, 7, 23) // 23 Aug 2026

const makeSource = (
  overrides: Partial<StableSourceForAccrual> = {}
): StableSourceForAccrual => ({
  id: 'src-1',
  expectedAmount: 3500,
  currency: 'GEL',
  expectedDay: 5,
  createdAt: new Date(2026, 6, 1), // 1 Jul 2026
  ...overrides,
})

describe('accrualKey', () => {
  it('builds a deterministic auto:<source>:<yyyy-MM> key', () => {
    expect(accrualKey('src-1', 2026, 7)).toBe('auto:src-1:2026-08')
    expect(accrualKey('src-1', 2026, 0)).toBe('auto:src-1:2026-01')
  })
})

describe('accrualDateFor', () => {
  it('uses the expected day', () => {
    expect(accrualDateFor(2026, 7, 5)).toEqual(new Date(2026, 7, 5))
  })

  it('defaults to the 1st when no expected day is set', () => {
    expect(accrualDateFor(2026, 7, null)).toEqual(new Date(2026, 7, 1))
  })

  it('clamps day 31 to the end of shorter months (Feb)', () => {
    expect(accrualDateFor(2026, 1, 31)).toEqual(new Date(2026, 1, 28))
    expect(accrualDateFor(2024, 1, 31)).toEqual(new Date(2024, 1, 29)) // leap year
  })
})

describe('computeDueAccruals', () => {
  it('accrues the current month once its day has arrived', () => {
    const due = computeDueAccruals({
      sources: [makeSource()],
      existingKeys: new Set(['auto:src-1:2026-07']),
      now: NOW,
    })

    expect(due).toEqual([
      {
        incomeSourceId: 'src-1',
        amount: 3500,
        currency: 'GEL',
        date: new Date(2026, 7, 5),
        externalId: 'auto:src-1:2026-08',
      },
    ])
  })

  it('does not accrue before the expected day', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ expectedDay: 25 })],
      existingKeys: new Set(['auto:src-1:2026-07']),
      now: NOW, // 23rd — before the 25th
    })

    expect(due).toEqual([])
  })

  it('accrues on the expected day itself', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ expectedDay: 23, createdAt: new Date(2026, 7, 1) })],
      existingKeys: new Set(),
      now: NOW,
    })

    expect(due).toHaveLength(1)
    expect(due[0].date).toEqual(new Date(2026, 7, 23))
  })

  it('backfills months missed since the source was created', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ createdAt: new Date(2026, 4, 2) })], // 2 May
      existingKeys: new Set(),
      now: NOW,
    })

    expect(due.map((d) => d.externalId)).toEqual([
      'auto:src-1:2026-05',
      'auto:src-1:2026-06',
      'auto:src-1:2026-07',
      'auto:src-1:2026-08',
    ])
  })

  it('skips months that are already accrued', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ createdAt: new Date(2026, 5, 1) })],
      existingKeys: new Set(['auto:src-1:2026-06', 'auto:src-1:2026-08']),
      now: NOW,
    })

    expect(due.map((d) => d.externalId)).toEqual(['auto:src-1:2026-07'])
  })

  it('does not fabricate history from before the source existed', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ createdAt: new Date(2026, 7, 10), expectedDay: 5 })],
      existingKeys: new Set(),
      now: NOW,
    })

    // Created on the 10th, pay day was the 5th — nothing due until September
    expect(due).toEqual([])
  })

  it('accrues when the source is created on its pay day', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ createdAt: new Date(2026, 7, 5, 14, 30) })],
      existingKeys: new Set(),
      now: NOW,
    })

    expect(due.map((d) => d.externalId)).toEqual(['auto:src-1:2026-08'])
  })

  it('caps backfill at MAX_ACCRUAL_MONTHS_BACK months', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ createdAt: new Date(2020, 0, 1) })],
      existingKeys: new Set(),
      now: NOW,
    })

    expect(due).toHaveLength(MAX_ACCRUAL_MONTHS_BACK + 1)
    expect(due[0].externalId).toBe('auto:src-1:2025-08')
    expect(due[due.length - 1].externalId).toBe('auto:src-1:2026-08')
  })

  it('ignores sources with a non-positive expected amount', () => {
    const due = computeDueAccruals({
      sources: [makeSource({ expectedAmount: 0 }), makeSource({ id: 'src-2', expectedAmount: NaN })],
      existingKeys: new Set(),
      now: NOW,
    })

    expect(due).toEqual([])
  })
})

describe('accrueStableIncomeForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.transaction.findMany.mockResolvedValue([])
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 })
  })

  it('creates AUTO transactions for due months with dedup keys', async () => {
    mockPrisma.incomeSource.findMany.mockResolvedValue([
      makeSource({ createdAt: new Date(2026, 6, 1) }),
    ])

    const created = await accrueStableIncomeForUser('user-1', NOW)

    expect(created).toBe(1)
    expect(mockPrisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          type: 'INCOME',
          amount: 3500,
          currency: 'GEL',
          incomeSourceId: 'src-1',
          entrySource: 'AUTO',
          externalId: 'auto:src-1:2026-07',
        }),
        expect.objectContaining({ externalId: 'auto:src-1:2026-08' }),
      ],
      skipDuplicates: true,
    })
  })

  it('does nothing when the user has no active stable sources', async () => {
    mockPrisma.incomeSource.findMany.mockResolvedValue([])

    const created = await accrueStableIncomeForUser('user-1', NOW)

    expect(created).toBe(0)
    expect(mockPrisma.transaction.createMany).not.toHaveBeenCalled()
  })

  it('does nothing when every due month is already accrued', async () => {
    mockPrisma.incomeSource.findMany.mockResolvedValue([
      makeSource({ createdAt: new Date(2026, 6, 1) }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      { externalId: 'auto:src-1:2026-07' },
      { externalId: 'auto:src-1:2026-08' },
    ])

    const created = await accrueStableIncomeForUser('user-1', NOW)

    expect(created).toBe(0)
    expect(mockPrisma.transaction.createMany).not.toHaveBeenCalled()
  })
})
