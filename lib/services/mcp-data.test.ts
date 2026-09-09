import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPrisma,
  mockDashboard,
  mockPlanView,
  mockDebts,
  mockGoals,
  mockQuickAdd,
  mockCreateExpense,
} = vi.hoisted(() => ({
  mockPrisma: {
    monthlyPlan: { findUnique: vi.fn() },
    expense: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), count: vi.fn() },
    category: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  mockDashboard: vi.fn(),
  mockPlanView: vi.fn(),
  mockDebts: vi.fn(),
  mockGoals: vi.fn(),
  mockQuickAdd: vi.fn(),
  mockCreateExpense: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/plan-view', () => ({
  buildDashboardData: mockDashboard,
  buildPlanView: mockPlanView,
}))
vi.mock('@/lib/services/debt-overview', () => ({ buildDebtsOverview: mockDebts }))
vi.mock('@/lib/services/goal-overview', () => ({ buildGoalsOverview: mockGoals }))
vi.mock('@/lib/services/quick-add', () => ({ addExpenseTransaction: mockQuickAdd }))
vi.mock('@/lib/actions/expense-actions', () => ({ createExpense: mockCreateExpense }))

import {
  MCP_DEFAULT_LIST,
  MCP_MAX_LIST,
  mcpAddTransaction,
  mcpCreateExpense,
  mcpGetDashboard,
  mcpGetMonthlyPlan,
  mcpListCategories,
  mcpListDebts,
  mcpListExpenses,
  mcpListGoals,
  mcpListTransactions,
} from './mcp-data'

const USER = 'user-a'
const NOW = new Date('2026-09-09T10:00:00Z')

// Prisma Decimal stand-in: JSON-unsafe object that Number() can unwrap.
const decimal = (n: number) => ({ toString: () => String(n), valueOf: () => n })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('view-model delegation (userId-first, no re-implementation)', () => {
  it('get_dashboard / list_debts / list_goals call the shared builders with the token user', async () => {
    mockDashboard.mockResolvedValue({ hasPlan: true })
    mockDebts.mockResolvedValue({ debts: [] })
    mockGoals.mockResolvedValue({ goals: [] })

    expect(await mcpGetDashboard(USER, NOW)).toEqual({ hasPlan: true })
    expect(await mcpListDebts(USER, NOW)).toEqual({ debts: [] })
    expect(await mcpListGoals(USER, NOW)).toEqual({ goals: [] })

    expect(mockDashboard).toHaveBeenCalledWith(USER, NOW)
    expect(mockDebts).toHaveBeenCalledWith(USER, NOW)
    expect(mockGoals).toHaveBeenCalledWith(USER, NOW)
  })
})

describe('mcpGetMonthlyPlan', () => {
  it('defaults to the current month and returns null without generating a plan', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)

    const r = await mcpGetMonthlyPlan(USER, undefined, NOW)

    expect(r).toEqual({ month: '2026-09', plan: null })
    expect(mockPrisma.monthlyPlan.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_month: { userId: USER, month: '2026-09' } } })
    )
    expect(mockPlanView).not.toHaveBeenCalled()
  })

  it('builds the view for an explicit month scoped to the user', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'plan-1' })
    mockPlanView.mockResolvedValue({ plan: { id: 'plan-1' } })

    const r = await mcpGetMonthlyPlan(USER, '2026-08', NOW)

    expect(r.month).toBe('2026-08')
    expect(r.plan).toEqual({ plan: { id: 'plan-1' } })
    expect(mockPlanView).toHaveBeenCalledWith(USER, 'plan-1', NOW)
  })
})

describe('mcpListExpenses', () => {
  it('scopes to the user, clamps the limit and converts Decimal → number', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([
      {
        id: 'e1',
        title: 'Rent',
        amount: decimal(850.5),
        currency: 'GEL',
        category: 'Housing',
        description: null,
        isRecurring: true,
        recurrenceRule: 'RRULE:FREQ=MONTHLY',
        nextDueDate: new Date('2000-01-01T00:00:00Z'),
        payments: [{ paid: false }],
      },
      {
        id: 'e2',
        title: 'Gym',
        amount: decimal(40),
        currency: 'USD',
        category: null,
        description: 'monthly',
        isRecurring: false,
        recurrenceRule: null,
        nextDueDate: null,
        payments: [],
      },
    ])

    const rows = await mcpListExpenses(USER, { limit: 9999 })

    const call = mockPrisma.expense.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ userId: USER })
    expect(call.take).toBe(MCP_MAX_LIST)
    expect(rows[0]).toEqual({
      id: 'e1',
      title: 'Rent',
      amount: 850.5,
      currency: 'GEL',
      category: 'Housing',
      description: null,
      isRecurring: true,
      recurrenceRule: 'RRULE:FREQ=MONTHLY',
      nextDueDate: '2000-01-01T00:00:00.000Z',
      isPaid: false,
      isOverdue: true,
    })
    expect(rows[1].amount).toBe(40)
    expect(rows[1].nextDueDate).toBeNull()
    expect(rows[1].isOverdue).toBe(false)
    expect(() => JSON.stringify(rows)).not.toThrow()
  })

  it('uses the default page size when no limit is given', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([])
    await mcpListExpenses(USER)
    expect(mockPrisma.expense.findMany.mock.calls[0][0].take).toBe(MCP_DEFAULT_LIST)
  })
})

describe('mcpListTransactions', () => {
  it('applies type/category/date filters on top of the user scope', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 't1',
        type: 'EXPENSE',
        amount: decimal(18),
        currency: 'GEL',
        date: new Date('2026-09-01T00:00:00Z'),
        categoryId: 'c1',
        category: { categoryName: 'Food' },
        incomeSource: null,
        description: null,
        entrySource: 'MANUAL',
      },
    ])
    mockPrisma.transaction.count.mockResolvedValue(1)

    const from = new Date('2026-09-01')
    const to = new Date('2026-09-30')
    const r = await mcpListTransactions(USER, { type: 'EXPENSE', categoryId: 'c1', from, to, limit: 0 })

    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where
    expect(where).toEqual({ userId: USER, type: 'EXPENSE', categoryId: 'c1', date: { gte: from, lte: to } })
    expect(mockPrisma.transaction.count).toHaveBeenCalledWith({ where })
    expect(mockPrisma.transaction.findMany.mock.calls[0][0].take).toBe(MCP_DEFAULT_LIST)
    expect(r.totalCount).toBe(1)
    expect(r.items[0]).toEqual({
      id: 't1',
      type: 'EXPENSE',
      amount: 18,
      currency: 'GEL',
      date: '2026-09-01T00:00:00.000Z',
      categoryId: 'c1',
      categoryName: 'Food',
      incomeSourceName: null,
      description: null,
      entrySource: 'MANUAL',
    })
  })
})

describe('mcpListCategories', () => {
  it('returns user categories with numeric limits', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 'c1', categoryName: 'Food', kind: 'VARIABLE', monthlyLimit: decimal(500), color: '#f00' },
      { id: 'c2', categoryName: 'Rent', kind: 'FIXED', monthlyLimit: null, color: '#0f0' },
    ])

    const rows = await mcpListCategories(USER)

    expect(mockPrisma.category.findMany.mock.calls[0][0].where).toEqual({ userId: USER })
    expect(rows).toEqual([
      { id: 'c1', name: 'Food', kind: 'VARIABLE', monthlyLimit: 500, color: '#f00' },
      { id: 'c2', name: 'Rent', kind: 'FIXED', monthlyLimit: null, color: '#0f0' },
    ])
  })
})

describe('mcpCreateExpense', () => {
  it('delegates to createExpense with the token user and returns a JSON-safe summary', async () => {
    mockCreateExpense.mockResolvedValue({
      success: true,
      data: { id: 'e1', title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: new Date('2026-10-01T00:00:00Z') },
    })

    const due = new Date('2026-10-01T00:00:00Z')
    const r = await mcpCreateExpense(USER, { title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: due })

    expect(mockCreateExpense).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: due, startDate: due })
    )
    expect(r).toEqual({
      ok: true,
      data: { id: 'e1', title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: '2026-10-01T00:00:00.000Z' },
    })
  })

  it('surfaces the action error', async () => {
    mockCreateExpense.mockResolvedValue({ success: false, error: 'boom' })
    expect(await mcpCreateExpense(USER, { title: 'x', amount: 1, currency: 'GEL' })).toEqual({ ok: false, error: 'boom' })
  })
})

describe('mcpAddTransaction', () => {
  it('requires a category id or name', async () => {
    const r = await mcpAddTransaction(USER, { amount: 5 })
    expect(r).toEqual({ ok: false, error: 'Provide categoryId or categoryName' })
    expect(mockQuickAdd).not.toHaveBeenCalled()
  })

  it('resolves a category by name within the user scope (case-insensitive)', async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: 'c1' })
    mockQuickAdd.mockResolvedValue({ ok: true, data: { transaction: { id: 't1' } } })

    const r = await mcpAddTransaction(USER, { amount: 18, categoryName: '  food ' })

    expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
      where: { userId: USER, categoryName: { equals: 'food', mode: 'insensitive' } },
      select: { id: true },
    })
    expect(mockQuickAdd).toHaveBeenCalledWith(USER, expect.objectContaining({ amount: 18, categoryId: 'c1' }))
    expect(r).toEqual({ ok: true, data: { transaction: { id: 't1' } } })
  })

  it('reports an unknown category name', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null)
    const r = await mcpAddTransaction(USER, { amount: 18, categoryName: 'Nope' })
    expect(r).toEqual({ ok: false, error: 'Category "Nope" not found' })
  })

  it('passes an explicit categoryId straight to the quick-add engine and forwards its error', async () => {
    mockQuickAdd.mockResolvedValue({ ok: false, error: 'Category not found or access denied' })

    const r = await mcpAddTransaction(USER, { amount: 18, categoryId: 'foreign' })

    expect(mockPrisma.category.findFirst).not.toHaveBeenCalled()
    expect(mockQuickAdd).toHaveBeenCalledWith(USER, expect.objectContaining({ categoryId: 'foreign' }))
    expect(r).toEqual({ ok: false, error: 'Category not found or access denied' })
  })
})
