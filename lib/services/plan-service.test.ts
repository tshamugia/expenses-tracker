import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockGenerate, mockPlanView, mockContext, mockActuals } = vi.hoisted(() => ({
  mockPrisma: {
    monthlyPlan: { findFirst: vi.fn(), update: vi.fn() },
    planAllocation: { update: vi.fn() },
    $transaction: vi.fn(),
  },
  mockGenerate: vi.fn(),
  mockPlanView: vi.fn(),
  mockContext: vi.fn(),
  mockActuals: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/plan-generation', () => ({ generatePlanForUser: mockGenerate }))
vi.mock('@/lib/services/plan-view', () => ({ buildPlanView: mockPlanView }))
vi.mock('@/lib/services/spend-status-service', () => ({ getCurrencyContext: mockContext }))
vi.mock('@/lib/services/month-actuals', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/month-actuals')>()
  return { ...actual, gatherMonthActuals: mockActuals }
})

import {
  buildClosePreview,
  confirmPlanForUser,
  regeneratePlanForUser,
  reopenPlanForUser,
} from './plan-service'

const USER = 'user-1'
const NOW = new Date('2026-09-10T12:00:00Z')
const decimal = (n: number) => ({ toString: () => String(n), valueOf: () => n })

const plan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan-1',
  userId: USER,
  month: '2026-09',
  status: 'DRAFT',
  forecastIncome: decimal(3000),
  forecastStable: decimal(3000),
  forecastVariable: decimal(0),
  actualIncome: null,
  safeToSpend: decimal(500),
  currency: 'GEL',
  confirmedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  allocations: [
    { id: 'a-rent', planId: 'plan-1', kind: 'MANDATORY', refId: null, label: 'Rent', planned: decimal(1000), actual: null },
    { id: 'a-goal', planId: 'plan-1', kind: 'GOAL', refId: 'g1', label: 'Laptop', planned: decimal(500), actual: null },
    { id: 'a-free', planId: 'plan-1', kind: 'FREE', refId: null, label: 'Free', planned: decimal(1500), actual: null },
  ],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPlanView.mockResolvedValue({ plan: { id: 'plan-1' } })
})

describe('regeneratePlanForUser', () => {
  it('defaults to the current month and returns the view', async () => {
    mockGenerate.mockResolvedValue({ planId: 'plan-1', skipped: false })
    const r = await regeneratePlanForUser(USER, undefined, NOW)
    expect(mockGenerate).toHaveBeenCalledWith(USER, '2026-09', NOW)
    expect(mockPlanView).toHaveBeenCalledWith(USER, 'plan-1', NOW)
    expect(r).toEqual({ ok: true, data: { plan: { id: 'plan-1' } } })
  })

  it('refuses a closed month', async () => {
    mockGenerate.mockResolvedValue({ planId: null, skipped: true, reason: 'closed' })
    const r = await regeneratePlanForUser(USER, '2026-07', NOW)
    expect(r.ok).toBe(false)
    expect(mockPlanView).not.toHaveBeenCalled()
  })
})

describe('confirmPlanForUser', () => {
  it("rejects a foreign plan and a closed month", async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(null)
    expect(await confirmPlanForUser(USER, 'plan-1', [], NOW)).toEqual({ ok: false, error: 'Plan not found or access denied' })
    expect(mockPrisma.monthlyPlan.findFirst).toHaveBeenCalledWith({ where: { id: 'plan-1', userId: USER }, include: { allocations: true } })

    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan({ status: 'CLOSED' }))
    expect(await confirmPlanForUser(USER, 'plan-1', [], NOW)).toEqual({ ok: false, error: 'This month is already closed' })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects negative adjustments and allocations from another plan', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan())
    expect(await confirmPlanForUser(USER, 'plan-1', [{ allocationId: 'a-goal', planned: -1 }], NOW)).toEqual({
      ok: false,
      error: 'Adjusted amounts must be zero or greater',
    })
    expect(await confirmPlanForUser(USER, 'plan-1', [{ allocationId: 'foreign', planned: 10 }], NOW)).toEqual({
      ok: false,
      error: 'Allocation foreign does not belong to this plan',
    })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('applies adjustments, recomputes FREE from the forecast and confirms atomically', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan())

    const r = await confirmPlanForUser(USER, 'plan-1', [{ allocationId: 'a-goal', planned: 300 }], NOW)

    expect(mockPrisma.planAllocation.update).toHaveBeenCalledWith({ where: { id: 'a-goal' }, data: { planned: 300 } })
    // FREE = 3000 - (1000 + 300)
    expect(mockPrisma.planAllocation.update).toHaveBeenCalledWith({ where: { id: 'a-free' }, data: { planned: 1700 } })
    expect(mockPrisma.monthlyPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { status: 'CONFIRMED', confirmedAt: NOW, safeToSpend: 1700 },
    })
    expect(r).toEqual({ ok: true, data: { plan: { id: 'plan-1' } } })
  })

  it('never lets FREE go negative', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan())
    await confirmPlanForUser(USER, 'plan-1', [{ allocationId: 'a-rent', planned: 5000 }], NOW)
    expect(mockPrisma.planAllocation.update).toHaveBeenCalledWith({ where: { id: 'a-free' }, data: { planned: 0 } })
  })
})

describe('reopenPlanForUser', () => {
  it('puts a confirmed plan back to DRAFT, refuses closed or foreign plans', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue({ id: 'plan-1', status: 'CONFIRMED' })
    expect(await reopenPlanForUser(USER, 'plan-1')).toEqual({ ok: true, data: undefined })
    expect(mockPrisma.monthlyPlan.update).toHaveBeenCalledWith({ where: { id: 'plan-1' }, data: { status: 'DRAFT', confirmedAt: null } })

    mockPrisma.monthlyPlan.findFirst.mockResolvedValue({ id: 'plan-1', status: 'CLOSED' })
    expect((await reopenPlanForUser(USER, 'plan-1')).ok).toBe(false)

    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(null)
    expect((await reopenPlanForUser(USER, 'plan-1')).ok).toBe(false)
    expect(mockPrisma.monthlyPlan.update).toHaveBeenCalledTimes(1)
  })
})

describe('buildClosePreview', () => {
  it('rejects a foreign plan', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(null)
    expect(await buildClosePreview(USER, 'plan-1')).toEqual({ ok: false, error: 'Plan not found or access denied' })
  })

  it('assembles plan-vs-actual lines, a verdict and proposed conclusions without writing', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(
      plan({
        allocations: [
          { id: 'a-var', planId: 'plan-1', kind: 'VARIABLE', refId: 'c1', label: 'Food', planned: decimal(400), actual: null },
          { id: 'a-free', planId: 'plan-1', kind: 'FREE', refId: null, label: 'Free', planned: decimal(2600), actual: null },
        ],
      })
    )
    mockContext.mockResolvedValue({ defaultCurrency: 'GEL', usdRate: null, eurRate: null })
    mockActuals.mockResolvedValue({
      incomeTotal: 3000,
      spendByCategory: new Map([['c1', 520]]),
      spendByExpense: new Map(),
      debtPaidByDebt: new Map(),
      debtPrincipalByDebt: new Map(),
      debtPrincipalPaidTotal: 0,
      contribByGoal: new Map(),
      reserveNet: 0,
      goalsNet: 0,
      newDebtPrincipal: 0,
      discretionarySpent: 520,
      categoryKind: new Map([['c1', 'VARIABLE']]),
    })

    const r = await buildClosePreview(USER, 'plan-1')

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.plan.id).toBe('plan-1')
    expect(r.data.defaultCurrency).toBe('GEL')
    expect(r.data.verdict.kind).toBeDefined()
    expect(typeof r.data.completionPct).toBe('number')
    const food = r.data.lines.find((l) => l.refId === 'c1')
    expect(food).toEqual(expect.objectContaining({ planned: 400, actual: 520 }))
    expect(mockPrisma.monthlyPlan.update).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
