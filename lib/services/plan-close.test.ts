import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockContext } = vi.hoisted(() => ({
  mockContext: vi.fn(),
  mockPrisma: {
    monthlyPlan: { findFirst: vi.fn(), update: vi.fn() },
    planAllocation: { update: vi.fn() },
    monthClose: { create: vi.fn() },
    transaction: { findMany: vi.fn(), aggregate: vi.fn() },
    category: { findMany: vi.fn() },
    goalContribution: { findMany: vi.fn() },
    debtScheduleItem: { findMany: vi.fn() },
    debt: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/spend-status-service', () => ({
  getCurrencyContext: mockContext,
}))

import { closePlanForUser } from './plan-close'

const USER_ID = 'user-1'

function emptyLedger() {
  mockPrisma.transaction.findMany.mockResolvedValue([])
  mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: null } })
  mockPrisma.category.findMany.mockResolvedValue([])
  mockPrisma.goalContribution.findMany.mockResolvedValue([])
  mockPrisma.debtScheduleItem.findMany.mockResolvedValue([])
  mockPrisma.debt.findMany.mockResolvedValue([])
}

function makePlan(overrides = {}) {
  return {
    id: 'plan-1',
    userId: USER_ID,
    status: 'CONFIRMED',
    month: '2026-08',
    forecastIncome: 4000,
    forecastStable: 4000,
    forecastVariable: 0,
    actualIncome: null,
    safeToSpend: 2000,
    currency: 'GEL',
    confirmedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    close: null,
    allocations: [
      { id: 'd', kind: 'DEBT', refId: 'debt-1', label: 'Loan', planned: 500, actual: null },
      { id: 'r', kind: 'RESERVE', refId: 'goal-res', label: 'Reserve', planned: 300, actual: null },
      { id: 'free', kind: 'FREE', refId: null, label: 'Free', planned: 2000, actual: null },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockContext.mockResolvedValue({ defaultCurrency: 'GEL', usdRate: null, eurRate: null })
  emptyLedger()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma)
  )
})

describe('closePlanForUser', () => {
  it('aggregates actuals into an honest verdict + achievement and persists CLOSED', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(makePlan())
    // debt principal 180 cleared, reserve +300 (meets its 300 requirement)
    mockPrisma.debtScheduleItem.findMany.mockResolvedValue([
      { debtId: 'debt-1', principalPart: 180, payment: 500, paidAmount: 500, transactionId: 'tx-1', debt: { currency: 'GEL' } },
    ])
    mockPrisma.goalContribution.findMany.mockResolvedValue([
      { goalId: 'goal-res', amount: 300, transactionId: 'tx-2', goal: { isEmergencyFund: true, currency: 'GEL' } },
    ])

    const result = await closePlanForUser(USER_ID, 'plan-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // netChange = 180 (debt) + 300 (reserve) − 0 = 480 → FORWARD
    expect(result.data.verdict.kind).toBe('FORWARD')
    expect(result.data.verdict.netChange).toBe(480)
    // required set-aside = reserve 300; actual = 300 → achieved
    expect(result.data.requiredSetAside).toBe(300)
    expect(result.data.actualSetAside).toBe(300)
    expect(result.data.achieved).toBe(true)

    const closeArg = mockPrisma.monthClose.create.mock.calls[0][0]
    expect(closeArg.data.verdict).toBe('FORWARD')
    expect(closeArg.data.debtPrincipalDelta).toBe(180)
    expect(closeArg.data.reserveDelta).toBe(300)
    expect(closeArg.data.achieved).toBe(true)

    const statusUpd = mockPrisma.monthlyPlan.update.mock.calls.find(
      (c) => c[0].data.status === 'CLOSED'
    )
    expect(statusUpd).toBeTruthy()
  })

  it('rejects a missing plan', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(null)
    const result = await closePlanForUser(USER_ID, 'nope')
    expect(result).toEqual({ ok: false, error: 'Plan not found or access denied' })
    expect(mockPrisma.monthClose.create).not.toHaveBeenCalled()
  })

  it('rejects an already-closed month', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(
      makePlan({ status: 'CLOSED', close: { id: 'c1' } })
    )
    const result = await closePlanForUser(USER_ID, 'plan-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/already closed/i)
    expect(mockPrisma.monthClose.create).not.toHaveBeenCalled()
  })

  it('marks not-achieved when contributions fall short of the required set-aside', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(makePlan())
    // Only 100 of the required 300 reserve set aside
    mockPrisma.goalContribution.findMany.mockResolvedValue([
      { goalId: 'goal-res', amount: 100, transactionId: 'tx-2', goal: { isEmergencyFund: true, currency: 'GEL' } },
    ])

    const result = await closePlanForUser(USER_ID, 'plan-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.requiredSetAside).toBe(300)
    expect(result.data.actualSetAside).toBe(100)
    expect(result.data.achieved).toBe(false)
  })
})
