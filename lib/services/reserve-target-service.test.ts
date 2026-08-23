import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockGetContext, mockNotifyTarget } = vi.hoisted(() => ({
  mockPrisma: {
    goal: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    expense: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
  mockGetContext: vi.fn(),
  mockNotifyTarget: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/spend-status-service', () => ({
  getCurrencyContext: mockGetContext,
}))
vi.mock('@/lib/services/notification-service', () => ({
  notifyReserveTargetChanged: mockNotifyTarget,
}))

import {
  computeMandatoryMonthly,
  recalcReserveTargetForUser,
} from './reserve-target-service'

const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetContext.mockResolvedValue({
    defaultCurrency: 'GEL',
    usdRate: null,
    eurRate: null,
  })
  mockPrisma.expense.findMany.mockResolvedValue([])
  mockPrisma.category.findMany.mockResolvedValue([])
  mockPrisma.transaction.findMany.mockResolvedValue([])
  mockNotifyTarget.mockResolvedValue({ success: true })
})

describe('computeMandatoryMonthly', () => {
  it('sums active fixed expenses and the 3-month FIXED category average', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 800, currency: 'GEL' },
      { amount: 400, currency: 'GEL' },
    ])
    mockPrisma.category.findMany.mockResolvedValue([{ id: 'cat-fixed' }])
    // 2700 over 3 months → 900/mo average
    mockPrisma.transaction.findMany.mockResolvedValue([
      { amount: 900, currency: 'GEL' },
      { amount: 900, currency: 'GEL' },
      { amount: 900, currency: 'GEL' },
    ])

    const { mandatoryMonthly } = await computeMandatoryMonthly(USER_ID)
    expect(mandatoryMonthly).toBe(2100) // 1200 fixed + 900 avg
  })
})

describe('recalcReserveTargetForUser', () => {
  it('returns null when the user has no emergency fund', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(null)
    const result = await recalcReserveTargetForUser(USER_ID)
    expect(result).toBeNull()
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })

  it('updates the target and notifies on a >10% move', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({
      id: 'reserve-1',
      reserveStage: 1,
      targetAmount: 2000,
      currency: 'GEL',
    })
    // mandatory 2400 → stage-1 target 2400 (20% up)
    mockPrisma.expense.findMany.mockResolvedValue([{ amount: 2400, currency: 'GEL' }])

    const result = await recalcReserveTargetForUser(USER_ID)

    expect(result).toEqual(
      expect.objectContaining({ changed: true, oldTarget: 2000, newTarget: 2400 })
    )
    expect(mockPrisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'reserve-1' },
      data: { targetAmount: 2400 },
    })
    expect(mockNotifyTarget).toHaveBeenCalled()
  })

  it('does not notify on a small (<10%) move', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({
      id: 'reserve-1',
      reserveStage: 1,
      targetAmount: 2000,
      currency: 'GEL',
    })
    // mandatory 2100 → 5% up
    mockPrisma.expense.findMany.mockResolvedValue([{ amount: 2100, currency: 'GEL' }])

    const result = await recalcReserveTargetForUser(USER_ID)

    expect(result?.changed).toBe(true)
    expect(mockPrisma.goal.update).toHaveBeenCalled()
    expect(mockNotifyTarget).not.toHaveBeenCalled()
  })

  it('is a no-op (no update) when the target is unchanged', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({
      id: 'reserve-1',
      reserveStage: 1,
      targetAmount: 2000,
      currency: 'GEL',
    })
    mockPrisma.expense.findMany.mockResolvedValue([{ amount: 2000, currency: 'GEL' }])

    const result = await recalcReserveTargetForUser(USER_ID)

    expect(result?.changed).toBe(false)
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })
})
