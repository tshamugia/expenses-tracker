import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockGather, mockContext } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGather: vi.fn(),
  mockContext: vi.fn(),
  mockPrisma: {
    monthlyPlan: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    planAllocation: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    monthClose: { create: vi.fn(), findMany: vi.fn() },
    transaction: { findMany: vi.fn(), aggregate: vi.fn() },
    category: { findMany: vi.fn() },
    goalContribution: { findMany: vi.fn() },
    debtScheduleItem: { findMany: vi.fn() },
    debt: { findMany: vi.fn() },
    goal: { findMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/plan-input', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/plan-input')>()
  return { ...actual, gatherPlanInput: mockGather }
})
vi.mock('@/lib/services/spend-status-service', () => ({
  getCurrencyContext: mockContext,
}))

import {
  applyWindfall,
  closeMonth,
  confirmPlan,
  generateMonthlyPlan,
  getActivePlan,
} from './plan-actions'

const USER_ID = 'user-1'
const CTX = { defaultCurrency: 'GEL', usdRate: null, eurRate: null }

const forecast = (total: number) => ({
  stableTotal: total,
  variableEstimate: 0,
  total,
  method: 'no_history' as const,
  monthsOfHistory: 0,
})

// Empty ledger for gatherMonthActuals-backed reads
function emptyLedger() {
  mockPrisma.transaction.findMany.mockResolvedValue([])
  mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: null } })
  mockPrisma.category.findMany.mockResolvedValue([])
  mockPrisma.goalContribution.findMany.mockResolvedValue([])
  mockPrisma.debtScheduleItem.findMany.mockResolvedValue([])
  mockPrisma.debt.findMany.mockResolvedValue([])
  mockPrisma.goal.findMany.mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
  mockContext.mockResolvedValue(CTX)
  emptyLedger()
  // default $transaction runs the callback against the prisma mock
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn as unknown[])
  )
})

describe('generateMonthlyPlan', () => {
  it('rejects an unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null)
    const r = await generateMonthlyPlan('2026-09')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unauthorized')
  })

  it('refuses to overwrite a CONFIRMED plan', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'p1', status: 'CONFIRMED' })
    const r = await generateMonthlyPlan('2026-09')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/confirmed plan already exists/i)
  })

  it('generates and persists a DRAFT via the waterfall', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)
    mockGather.mockResolvedValue({
      input: {
        forecast: forecast(5000),
        mandatoryFixed: [{ label: 'Rent', amount: 1000, refId: 'exp-1' }],
        variableTargets: [],
        debtInstallments: [{ debtId: 'd1', label: 'Loan', amount: 500 }],
        reserve: null,
        goals: [],
        conclusions: [],
        daysInMonth: 30,
      },
      currency: 'GEL',
      month: '2026-09',
      monthStart: new Date(2026, 8, 1),
      monthEnd: new Date(2026, 8, 30),
    })
    const created = {
      id: 'plan-1',
      userId: USER_ID,
      month: '2026-09',
      status: 'DRAFT',
      forecastIncome: 5000,
      forecastStable: 5000,
      forecastVariable: 0,
      actualIncome: null,
      safeToSpend: 3500,
      currency: 'GEL',
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      allocations: [
        { id: 'a1', planId: 'plan-1', kind: 'MANDATORY', refId: 'exp-1', label: 'Rent', planned: 1000, actual: null },
        { id: 'a2', planId: 'plan-1', kind: 'DEBT', refId: 'd1', label: 'Loan', planned: 500, actual: null },
        { id: 'a3', planId: 'plan-1', kind: 'FREE', refId: null, label: 'Safe to spend', planned: 3500, actual: null },
      ],
    }
    mockPrisma.monthlyPlan.create.mockResolvedValue(created)
    mockPrisma.monthlyPlan.findFirstOrThrow.mockResolvedValue(created)

    const r = await generateMonthlyPlan('2026-09')
    expect(r.success).toBe(true)
    expect(mockPrisma.monthlyPlan.create).toHaveBeenCalledTimes(1)
    const createArg = mockPrisma.monthlyPlan.create.mock.calls[0][0]
    // FREE = 5000 - 1000 - 500 = 3500
    expect(createArg.data.safeToSpend).toBe(3500)
    const freeAlloc = createArg.data.allocations.create.find((a: { kind: string }) => a.kind === 'FREE')
    expect(freeAlloc.planned).toBe(3500)
  })
})

describe('confirmPlan', () => {
  it('recomputes FREE from the forecast and marks the plan CONFIRMED', async () => {
    const plan = {
      id: 'plan-1',
      userId: USER_ID,
      status: 'DRAFT',
      month: '2026-09',
      forecastIncome: 5000,
      safeToSpend: 3500,
      allocations: [
        { id: 'a1', kind: 'MANDATORY', planned: 1000 },
        { id: 'a2', kind: 'DEBT', planned: 500 },
        { id: 'free', kind: 'FREE', planned: 3500 },
      ],
    }
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan)
    mockPrisma.monthlyPlan.findFirstOrThrow.mockResolvedValue({
      ...plan,
      status: 'CONFIRMED',
      forecastStable: 5000,
      forecastVariable: 0,
      actualIncome: null,
      currency: 'GEL',
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      allocations: plan.allocations.map((a) => ({ ...a, refId: null, label: a.kind, actual: null })),
    })

    // reduce the debt allocation to 300 → FREE should become 3700
    const r = await confirmPlan('plan-1', [{ allocationId: 'a2', planned: 300 }])
    expect(r.success).toBe(true)

    const planUpdate = mockPrisma.monthlyPlan.update.mock.calls.find(
      (c) => c[0].data.status === 'CONFIRMED'
    )
    expect(planUpdate?.[0].data.safeToSpend).toBe(3700)
    // FREE allocation updated to 3700
    const freeUpdate = mockPrisma.planAllocation.update.mock.calls.find((c) => c[0].where.id === 'free')
    expect(freeUpdate?.[0].data.planned).toBe(3700)
  })
})

describe('applyWindfall', () => {
  it('bumps debt / goal / free allocations by the split and snapshots income', async () => {
    const plan = {
      id: 'plan-1',
      userId: USER_ID,
      status: 'CONFIRMED',
      month: '2026-09',
      safeToSpend: 2000,
      allocations: [
        { id: 'd', kind: 'DEBT', planned: 500 },
        { id: 'g', kind: 'GOAL', planned: 200 },
        { id: 'free', kind: 'FREE', planned: 2000 },
      ],
    }
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan)
    mockPrisma.monthlyPlan.findFirstOrThrow.mockResolvedValue({
      ...plan,
      forecastIncome: 4000,
      forecastStable: 4000,
      forecastVariable: 0,
      actualIncome: 4300,
      currency: 'GEL',
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      allocations: plan.allocations.map((a) => ({ ...a, refId: null, label: a.kind, actual: null })),
    })
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      windfallDebtPct: 50,
      windfallGoalsPct: 30,
      windfallFreePct: 20,
    })

    const r = await applyWindfall('plan-1', { toDebt: 150, toGoals: 90, toFree: 60 })
    expect(r.success).toBe(true)

    const debtUpd = mockPrisma.planAllocation.update.mock.calls.find((c) => c[0].where.id === 'd')
    const goalUpd = mockPrisma.planAllocation.update.mock.calls.find((c) => c[0].where.id === 'g')
    const freeUpd = mockPrisma.planAllocation.update.mock.calls.find((c) => c[0].where.id === 'free')
    expect(debtUpd?.[0].data.planned).toBe(650)
    expect(goalUpd?.[0].data.planned).toBe(290)
    expect(freeUpd?.[0].data.planned).toBe(2060)

    const planUpd = mockPrisma.monthlyPlan.update.mock.calls[0]
    expect(planUpd[0].data.safeToSpend).toBe(2060)
  })

  it('rejects a windfall on a non-confirmed plan', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue({ id: 'plan-1', userId: USER_ID, status: 'DRAFT', allocations: [] })
    const r = await applyWindfall('plan-1', { toDebt: 10, toGoals: 10, toFree: 10 })
    expect(r.success).toBe(false)
  })
})

describe('closeMonth', () => {
  it('aggregates actuals into an honest verdict and persists CLOSED atomically', async () => {
    const plan = {
      id: 'plan-1',
      userId: USER_ID,
      status: 'CONFIRMED',
      month: '2026-09',
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
    }
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue(plan)

    // Ledger: debt principal 180 cleared, reserve +300
    mockPrisma.debtScheduleItem.findMany.mockResolvedValue([
      { debtId: 'debt-1', principalPart: 180, payment: 500, paidAmount: 500, transactionId: 'tx-1', debt: { currency: 'GEL' } },
    ])
    mockPrisma.goalContribution.findMany.mockResolvedValue([
      { goalId: 'goal-res', amount: 300, transactionId: 'tx-2', goal: { isEmergencyFund: true, currency: 'GEL' } },
    ])

    const r = await closeMonth('plan-1', { conclusions: [] })
    expect(r.success).toBe(true)
    // netChange = 180 (debt) + 300 (reserve) + 0 - 0 = 480 → FORWARD
    expect(r.data?.verdict.kind).toBe('FORWARD')
    expect(r.data?.verdict.netChange).toBe(480)

    expect(mockPrisma.monthClose.create).toHaveBeenCalledTimes(1)
    const closeArg = mockPrisma.monthClose.create.mock.calls[0][0]
    expect(closeArg.data.verdict).toBe('FORWARD')
    expect(closeArg.data.debtPrincipalDelta).toBe(180)
    expect(closeArg.data.reserveDelta).toBe(300)

    const statusUpd = mockPrisma.monthlyPlan.update.mock.calls.find((c) => c[0].data.status === 'CLOSED')
    expect(statusUpd).toBeTruthy()
  })

  it('rejects closing an already-closed month', async () => {
    mockPrisma.monthlyPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      userId: USER_ID,
      status: 'CLOSED',
      close: { id: 'c1' },
      allocations: [],
    })
    const r = await closeMonth('plan-1')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/already closed/i)
  })
})

describe('getActivePlan', () => {
  it('returns null when there is no plan for the month', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)
    const r = await getActivePlan('2026-09')
    expect(r.success).toBe(true)
    expect(r.data).toBeNull()
  })

  it('computes remaining Safe to spend from the flexible pool minus discretionary spend', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'plan-1' })
    mockPrisma.monthlyPlan.findFirstOrThrow.mockResolvedValue({
      id: 'plan-1',
      userId: USER_ID,
      status: 'CONFIRMED',
      month: '2026-09',
      forecastIncome: 5000,
      forecastStable: 5000,
      forecastVariable: 0,
      actualIncome: null,
      safeToSpend: 600,
      currency: 'GEL',
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      allocations: [
        { id: 'v', kind: 'VARIABLE', refId: 'cat-food', label: 'Food', planned: 400, actual: null },
        { id: 'free', kind: 'FREE', refId: null, label: 'Free', planned: 600, actual: null },
      ],
    })
    // discretionary spend of 200 (uncategorized expense)
    mockPrisma.transaction.findMany.mockResolvedValue([
      { id: 'tx-x', amount: 200, currency: 'GEL', categoryId: null, expenseId: null },
    ])

    const r = await getActivePlan('2026-09')
    expect(r.success).toBe(true)
    // flexible = 600 (free) + 400 (variable) = 1000; spent 200 → remaining 800
    expect(r.data?.safeToSpendMonth).toBe(800)
    expect(r.data?.spentFree).toBe(200)
  })
})
