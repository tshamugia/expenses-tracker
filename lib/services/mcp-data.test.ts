import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPrisma,
  mockDashboard,
  mockPlanView,
  mockStability,
  mockDebts,
  mockGoals,
  mockQuickAdd,
  mockExpenseActions,
  mockIncome,
  mockGoalSvc,
  mockCategorySvc,
  mockTransactionSvc,
  mockDebtSvc,
  mockPlanSvc,
  mockClosePlan,
  mockCardSvc,
} = vi.hoisted(() => ({
  mockPrisma: {
    monthlyPlan: { findUnique: vi.fn() },
    expense: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), count: vi.fn() },
    category: { findMany: vi.fn(), findFirst: vi.fn() },
    paymentCard: { findFirst: vi.fn() },
    incomeSource: { findFirst: vi.fn() },
    debtScheduleItem: { findFirst: vi.fn() },
  },
  mockDashboard: vi.fn(),
  mockPlanView: vi.fn(),
  mockStability: vi.fn(),
  mockDebts: vi.fn(),
  mockGoals: vi.fn(),
  mockQuickAdd: vi.fn(),
  mockExpenseActions: {
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    markExpensePaid: vi.fn(),
  },
  mockIncome: {
    buildIncomeOverview: vi.fn(),
    createIncomeSourceForUser: vi.fn(),
    updateIncomeSourceForUser: vi.fn(),
    archiveIncomeSourceForUser: vi.fn(),
    recordIncomeForUser: vi.fn(),
  },
  mockGoalSvc: {
    getGoalDetailForUser: vi.fn(),
    createGoalForUser: vi.fn(),
    approveGoalForUser: vi.fn(),
    updateGoalForUser: vi.fn(),
    archiveGoalForUser: vi.fn(),
    reorderGoalsForUser: vi.fn(),
    contributeToGoalForUser: vi.fn(),
    withdrawFromGoalForUser: vi.fn(),
    advanceReserveStageForUser: vi.fn(),
  },
  mockCategorySvc: {
    createCategoryForUser: vi.fn(),
    updateCategoryForUser: vi.fn(),
    deleteCategoryForUser: vi.fn(),
  },
  mockTransactionSvc: {
    updateTransactionForUser: vi.fn(),
    deleteTransactionForUser: vi.fn(),
  },
  mockDebtSvc: {
    getDebtDetailForUser: vi.fn(),
    createDebtForUser: vi.fn(),
    updateDebtForUser: vi.fn(),
    archiveDebtForUser: vi.fn(),
    recordDebtPaymentForUser: vi.fn(),
    simulatePrepaymentForUser: vi.fn(),
    applyPrepaymentForUser: vi.fn(),
  },
  mockPlanSvc: {
    regeneratePlanForUser: vi.fn(),
    confirmPlanForUser: vi.fn(),
    reopenPlanForUser: vi.fn(),
    buildClosePreview: vi.fn(),
  },
  mockClosePlan: vi.fn(),
  mockCardSvc: {
    listPaymentCardsForUser: vi.fn(),
    createPaymentCardForUser: vi.fn(),
    updatePaymentCardForUser: vi.fn(),
    deletePaymentCardForUser: vi.fn(),
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/plan-view', () => ({
  buildDashboardData: mockDashboard,
  buildPlanView: mockPlanView,
  computeStabilityProgress: mockStability,
}))
vi.mock('@/lib/services/debt-overview', () => ({ buildDebtsOverview: mockDebts }))
vi.mock('@/lib/services/goal-overview', () => ({ buildGoalsOverview: mockGoals }))
vi.mock('@/lib/services/quick-add', () => ({ addExpenseTransaction: mockQuickAdd }))
vi.mock('@/lib/actions/expense-actions', () => mockExpenseActions)
vi.mock('@/lib/services/income-service', () => mockIncome)
vi.mock('@/lib/services/goal-service', () => mockGoalSvc)
vi.mock('@/lib/services/category-service', () => mockCategorySvc)
vi.mock('@/lib/services/transaction-service', () => mockTransactionSvc)
vi.mock('@/lib/services/debt-service', () => mockDebtSvc)
vi.mock('@/lib/services/plan-service', () => mockPlanSvc)
vi.mock('@/lib/services/plan-close', () => ({ closePlanForUser: mockClosePlan }))
vi.mock('@/lib/services/payment-card-service', () => mockCardSvc)

import {
  MCP_DEFAULT_LIST,
  MCP_MAX_LIST,
  mcpAddTransaction,
  mcpArchiveGoal,
  mcpCloseMonth,
  mcpConfirmPlan,
  mcpCreateCategory,
  mcpCreateExpense,
  mcpCreatePaymentCard,
  mcpDeleteCategory,
  mcpDeleteExpense,
  mcpGetClosePreview,
  mcpGetDashboard,
  mcpGetMonthlyPlan,
  mcpGetStabilityProgress,
  mcpListCategories,
  mcpListDebts,
  mcpListExpenses,
  mcpListGoals,
  mcpListIncomeSources,
  mcpListTransactions,
  mcpMarkExpensePaid,
  mcpRecordDebtPayment,
  mcpRecordIncome,
  mcpReopenPlan,
  mcpUpdateCategory,
  mcpUpdateExpense,
  mcpUpdateTransaction,
  mcpWithdrawFromGoal,
  resolveCategoryId,
  resolvePlanId,
  toExpenseItem,
} from './mcp-data'

const USER = 'user-a'
const NOW = new Date('2026-09-09T10:00:00Z')

// Prisma Decimal stand-in: JSON-unsafe object that Number() can unwrap.
const decimal = (n: number) => ({ toString: () => String(n), valueOf: () => n })

const expenseRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Rent',
  amount: decimal(850.5),
  currency: 'GEL',
  category: 'Housing',
  description: null,
  isRecurring: true,
  recurrenceRule: 'RRULE:FREQ=MONTHLY',
  nextDueDate: new Date('2000-01-01T00:00:00Z'),
  paymentCardId: null,
  payments: [{ paid: false, dueDate: new Date('2000-01-01T00:00:00Z') }],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('view-model delegation (userId-first, no re-implementation)', () => {
  it('reads call the shared builders with the token user', async () => {
    mockDashboard.mockResolvedValue({ hasPlan: true })
    mockDebts.mockResolvedValue({ debts: [] })
    mockGoals.mockResolvedValue({ goals: [] })
    mockStability.mockResolvedValue({ stage: 1 })
    mockIncome.buildIncomeOverview.mockResolvedValue({ sources: [] })

    expect(await mcpGetDashboard(USER, NOW)).toEqual({ hasPlan: true })
    expect(await mcpListDebts(USER, NOW)).toEqual({ debts: [] })
    expect(await mcpListGoals(USER, NOW)).toEqual({ goals: [] })
    expect(await mcpGetStabilityProgress(USER, NOW)).toEqual({ stage: 1 })
    expect(await mcpListIncomeSources(USER, NOW)).toEqual({ sources: [] })

    expect(mockDashboard).toHaveBeenCalledWith(USER, NOW)
    expect(mockDebts).toHaveBeenCalledWith(USER, NOW)
    expect(mockGoals).toHaveBeenCalledWith(USER, NOW)
    expect(mockStability).toHaveBeenCalledWith(USER, NOW)
    expect(mockIncome.buildIncomeOverview).toHaveBeenCalledWith(USER, NOW)
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
      expenseRow(),
      expenseRow({
        id: 'e2',
        title: 'Gym',
        amount: decimal(40),
        currency: 'USD',
        category: null,
        description: 'monthly',
        isRecurring: false,
        recurrenceRule: null,
        nextDueDate: null,
        paymentCardId: 'card-1',
        payments: [],
      }),
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
      paymentCardId: null,
      isPaid: false,
      isOverdue: true,
    })
    expect(rows[1].amount).toBe(40)
    expect(rows[1].nextDueDate).toBeNull()
    expect(rows[1].isOverdue).toBe(false)
    expect(rows[1].paymentCardId).toBe('card-1')
    expect(() => JSON.stringify(rows)).not.toThrow()
  })

  it('uses the default page size when no limit is given', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([])
    await mcpListExpenses(USER)
    expect(mockPrisma.expense.findMany.mock.calls[0][0].take).toBe(MCP_DEFAULT_LIST)
  })

  it('toExpenseItem takes the paid flag from the latest payment', () => {
    const item = toExpenseItem(
      expenseRow({
        nextDueDate: new Date('2999-01-01T00:00:00Z'),
        payments: [
          { paid: false, dueDate: new Date('2026-08-01') },
          { paid: true, dueDate: new Date('2026-09-01') },
        ],
      })
    )
    expect(item.isPaid).toBe(true)
    expect(item.isOverdue).toBe(false)
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
        incomeSourceId: null,
        incomeSource: null,
        expenseId: null,
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
      incomeSourceId: null,
      incomeSourceName: null,
      expenseId: null,
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

describe('fixed bills (Expense) writes', () => {
  const created = expenseRow({ id: 'e1', title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: new Date('2026-10-01T00:00:00Z'), payments: [{ paid: false, dueDate: new Date('2026-10-01T00:00:00Z') }] })

  it('mcpCreateExpense delegates to createExpense with the token user and returns a JSON-safe summary', async () => {
    mockExpenseActions.createExpense.mockResolvedValue({ success: true, data: created })

    const due = new Date('2026-10-01T00:00:00Z')
    const r = await mcpCreateExpense(USER, { title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: due })

    expect(mockExpenseActions.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: due, startDate: due })
    )
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({ id: 'e1', title: 'Netflix', amount: 12.99, currency: 'USD', nextDueDate: '2026-10-01T00:00:00.000Z', isPaid: false }),
    })
  })

  it('mcpCreateExpense surfaces the action error', async () => {
    mockExpenseActions.createExpense.mockResolvedValue({ success: false, error: 'boom' })
    expect(await mcpCreateExpense(USER, { title: 'x', amount: 1, currency: 'GEL' })).toEqual({ ok: false, error: 'boom' })
  })

  it("mcpCreateExpense / mcpUpdateExpense refuse another user's payment card", async () => {
    mockPrisma.paymentCard.findFirst.mockResolvedValue(null)

    expect(await mcpCreateExpense(USER, { title: 'x', amount: 1, currency: 'GEL', paymentCardId: 'foreign' })).toEqual({
      ok: false,
      error: 'Payment card not found or access denied',
    })
    expect(await mcpUpdateExpense(USER, 'e1', { paymentCardId: 'foreign' })).toEqual({
      ok: false,
      error: 'Payment card not found or access denied',
    })
    expect(mockPrisma.paymentCard.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', userId: USER }, select: { id: true } })
    expect(mockExpenseActions.createExpense).not.toHaveBeenCalled()
    expect(mockExpenseActions.updateExpense).not.toHaveBeenCalled()
  })

  it('mcpUpdateExpense validates the amount and passes the user to updateExpense', async () => {
    expect(await mcpUpdateExpense(USER, 'e1', { amount: 0 })).toEqual({ ok: false, error: 'Amount must be greater than zero' })

    mockExpenseActions.updateExpense.mockResolvedValue({ success: true, data: created })
    const r = await mcpUpdateExpense(USER, 'e1', { title: 'Netflix' })
    expect(mockExpenseActions.updateExpense).toHaveBeenCalledWith('e1', USER, { title: 'Netflix', nextDueDate: undefined })
    expect(r.ok).toBe(true)
  })

  it('mcpDeleteExpense / mcpMarkExpensePaid delegate with the user and map results', async () => {
    mockExpenseActions.deleteExpense.mockResolvedValue({ success: true })
    expect(await mcpDeleteExpense(USER, 'e1')).toEqual({ ok: true, data: { id: 'e1', deleted: true } })
    expect(mockExpenseActions.deleteExpense).toHaveBeenCalledWith('e1', USER)

    mockExpenseActions.markExpensePaid.mockResolvedValue({ success: false, error: 'No unpaid payment found' })
    expect(await mcpMarkExpensePaid(USER, 'e1')).toEqual({ ok: false, error: 'No unpaid payment found' })
    expect(mockExpenseActions.markExpensePaid).toHaveBeenCalledWith('e1', USER)
  })
})

describe('resolveCategoryId / mcpAddTransaction', () => {
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
    expect(await resolveCategoryId(USER, { categoryName: 'Nope' })).toEqual({ ok: false, error: 'Category "Nope" not found' })
  })

  it('passes an explicit categoryId straight to the quick-add engine and forwards its error', async () => {
    mockQuickAdd.mockResolvedValue({ ok: false, error: 'Category not found or access denied' })

    const r = await mcpAddTransaction(USER, { amount: 18, categoryId: 'foreign' })

    expect(mockPrisma.category.findFirst).not.toHaveBeenCalled()
    expect(mockQuickAdd).toHaveBeenCalledWith(USER, expect.objectContaining({ categoryId: 'foreign' }))
    expect(r).toEqual({ ok: false, error: 'Category not found or access denied' })
  })
})

describe('mcpUpdateTransaction', () => {
  it('resolves categoryName to an id before delegating', async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: 'c9' })
    mockTransactionSvc.updateTransactionForUser.mockResolvedValue({ ok: true, data: { id: 't1' } })

    await mcpUpdateTransaction(USER, 't1', { amount: 20, categoryName: 'Food' })

    expect(mockTransactionSvc.updateTransactionForUser).toHaveBeenCalledWith(USER, 't1', { amount: 20, categoryId: 'c9' })
  })

  it('lets categoryId: null clear the category', async () => {
    mockTransactionSvc.updateTransactionForUser.mockResolvedValue({ ok: true, data: { id: 't1' } })
    await mcpUpdateTransaction(USER, 't1', { categoryId: null })
    expect(mockTransactionSvc.updateTransactionForUser).toHaveBeenCalledWith(USER, 't1', { categoryId: null })
    expect(mockPrisma.category.findFirst).not.toHaveBeenCalled()
  })
})

describe('mcpRecordIncome', () => {
  it('resolves an income source by name within the user scope', async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue({ id: 's1' })
    mockIncome.recordIncomeForUser.mockResolvedValue({ ok: true, data: { monthTotal: 100 } })

    await mcpRecordIncome(USER, { amount: 100, incomeSourceName: ' Freelance ' })

    expect(mockPrisma.incomeSource.findFirst).toHaveBeenCalledWith({
      where: { userId: USER, name: { equals: 'Freelance', mode: 'insensitive' } },
      select: { id: true },
    })
    expect(mockIncome.recordIncomeForUser).toHaveBeenCalledWith(USER, expect.objectContaining({ amount: 100, incomeSourceId: 's1' }))
  })

  it('reports an unknown source name and allows one-off income without a source', async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue(null)
    expect(await mcpRecordIncome(USER, { amount: 5, incomeSourceName: 'Nope' })).toEqual({ ok: false, error: 'Income source "Nope" not found' })

    mockIncome.recordIncomeForUser.mockResolvedValue({ ok: true, data: { monthTotal: 5 } })
    await mcpRecordIncome(USER, { amount: 5 })
    expect(mockIncome.recordIncomeForUser).toHaveBeenLastCalledWith(USER, expect.objectContaining({ incomeSourceId: undefined }))
  })
})

describe('goal / category wrappers', () => {
  it('mcpArchiveGoal and mcpWithdrawFromGoal return JSON summaries on success and forward errors', async () => {
    mockGoalSvc.archiveGoalForUser.mockResolvedValue({ ok: true, data: undefined })
    expect(await mcpArchiveGoal(USER, 'g1')).toEqual({ ok: true, data: { id: 'g1', status: 'ARCHIVED' } })

    mockGoalSvc.withdrawFromGoalForUser.mockResolvedValue({ ok: false, error: 'Cannot withdraw more than the saved amount' })
    expect(await mcpWithdrawFromGoal(USER, 'g1', { amount: 50, reason: 'car' })).toEqual({
      ok: false,
      error: 'Cannot withdraw more than the saved amount',
    })
    expect(mockGoalSvc.withdrawFromGoalForUser).toHaveBeenCalledWith(USER, 'g1', { amount: 50, reason: 'car' })
  })

  it('category wrappers map name ↔ categoryName and return the compact item', async () => {
    const cat = { id: 'c1', categoryName: 'Food', kind: 'VARIABLE', monthlyLimit: 300, color: '#f00' }
    mockCategorySvc.createCategoryForUser.mockResolvedValue({ ok: true, data: cat })
    expect(await mcpCreateCategory(USER, { name: 'Food', monthlyLimit: 300 })).toEqual({
      ok: true,
      data: { id: 'c1', name: 'Food', kind: 'VARIABLE', monthlyLimit: 300, color: '#f00' },
    })
    expect(mockCategorySvc.createCategoryForUser).toHaveBeenCalledWith(USER, {
      categoryName: 'Food',
      color: undefined,
      kind: undefined,
      monthlyLimit: 300,
    })

    mockCategorySvc.updateCategoryForUser.mockResolvedValue({ ok: true, data: { ...cat, kind: 'FIXED' } })
    await mcpUpdateCategory(USER, 'c1', { name: 'Groceries', kind: 'FIXED', monthlyLimit: null })
    expect(mockCategorySvc.updateCategoryForUser).toHaveBeenCalledWith(USER, 'c1', {
      categoryName: 'Groceries',
      kind: 'FIXED',
      monthlyLimit: null,
    })

    mockCategorySvc.deleteCategoryForUser.mockResolvedValue({ ok: true, data: undefined })
    expect(await mcpDeleteCategory(USER, 'c1')).toEqual({ ok: true, data: { id: 'c1', deleted: true } })
  })
})

describe('mcpRecordDebtPayment', () => {
  it('requires a schedule item or a debt id', async () => {
    expect(await mcpRecordDebtPayment(USER, {})).toEqual({ ok: false, error: 'Provide scheduleItemId or debtId' })
  })

  it("picks the debt's next unpaid installment scoped to the user", async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue({ id: 'item-3' })
    mockDebtSvc.recordDebtPaymentForUser.mockResolvedValue({ ok: true, data: { paidOff: false, debtId: 'd1' } })

    const r = await mcpRecordDebtPayment(USER, { debtId: 'd1', amount: 100 })

    expect(mockPrisma.debtScheduleItem.findFirst).toHaveBeenCalledWith({
      where: { debtId: 'd1', paid: false, debt: { userId: USER } },
      orderBy: { seq: 'asc' },
      select: { id: true },
    })
    expect(mockDebtSvc.recordDebtPaymentForUser).toHaveBeenCalledWith(USER, 'item-3', { amount: 100, paidAt: undefined })
    expect(r).toEqual({ ok: true, data: { paidOff: false, debtId: 'd1', scheduleItemId: 'item-3' } })
  })

  it('reports when there is nothing left to pay (or the debt is foreign)', async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue(null)
    expect(await mcpRecordDebtPayment(USER, { debtId: 'd1' })).toEqual({
      ok: false,
      error: 'Debt not found, access denied, or no unpaid installments',
    })
  })
})

describe('plan writes resolve the plan by id or month', () => {
  it('resolvePlanId uses the explicit id, else looks up the month (default current)', async () => {
    expect(await resolvePlanId(USER, { planId: 'p1' }, NOW)).toEqual({ ok: true, data: 'p1' })
    expect(mockPrisma.monthlyPlan.findUnique).not.toHaveBeenCalled()

    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'p9' })
    expect(await resolvePlanId(USER, {}, NOW)).toEqual({ ok: true, data: 'p9' })
    expect(mockPrisma.monthlyPlan.findUnique).toHaveBeenCalledWith({
      where: { userId_month: { userId: USER, month: '2026-09' } },
      select: { id: true },
    })

    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)
    expect(await resolvePlanId(USER, { month: '2026-07' }, NOW)).toEqual({
      ok: false,
      error: 'No plan exists for 2026-07. Call generate_monthly_plan first.',
    })
  })

  it('confirm / reopen / preview / close delegate with the resolved plan id', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'p9' })
    mockPlanSvc.confirmPlanForUser.mockResolvedValue({ ok: true, data: { plan: { id: 'p9' } } })
    mockPlanSvc.reopenPlanForUser.mockResolvedValue({ ok: true, data: undefined })
    mockPlanSvc.buildClosePreview.mockResolvedValue({ ok: true, data: { completionPct: 80 } })
    mockClosePlan.mockResolvedValue({ ok: false, error: 'This month is already closed' })

    await mcpConfirmPlan(USER, {}, [{ allocationId: 'a1', planned: 10 }], NOW)
    expect(mockPlanSvc.confirmPlanForUser).toHaveBeenCalledWith(USER, 'p9', [{ allocationId: 'a1', planned: 10 }], NOW)

    expect(await mcpReopenPlan(USER, { planId: 'p1' }, NOW)).toEqual({ ok: true, data: { planId: 'p1', status: 'DRAFT' } })
    expect(mockPlanSvc.reopenPlanForUser).toHaveBeenCalledWith(USER, 'p1')

    expect(await mcpGetClosePreview(USER, {}, NOW)).toEqual({ ok: true, data: { completionPct: 80 } })

    expect(await mcpCloseMonth(USER, {}, { conclusions: [] }, NOW)).toEqual({ ok: false, error: 'This month is already closed' })
    expect(mockClosePlan).toHaveBeenCalledWith(USER, 'p9', { conclusions: [] })
  })

  it('a missing plan short-circuits before any write', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)
    const r = await mcpConfirmPlan(USER, {}, [], NOW)
    expect(r.ok).toBe(false)
    expect(mockPlanSvc.confirmPlanForUser).not.toHaveBeenCalled()
  })
})

describe('payment card wrappers', () => {
  it('never returns more than the last four digits', async () => {
    mockCardSvc.createPaymentCardForUser.mockResolvedValue({
      ok: true,
      data: {
        id: 'card-1',
        userId: USER,
        cardholderName: 'T S',
        lastFourDigits: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
        cardBrand: 'Visa',
        nickname: null,
        color: '#1e40af',
        createdAt: NOW,
        updatedAt: NOW,
      },
    })

    const r = await mcpCreatePaymentCard(USER, { cardholderName: 'T S', cardNumber: '4242424242424242', expiryMonth: 12, expiryYear: 2030 })

    expect(r).toEqual({
      ok: true,
      data: { id: 'card-1', cardholderName: 'T S', lastFourDigits: '4242', expiryMonth: 12, expiryYear: 2030, cardBrand: 'Visa', nickname: null, color: '#1e40af' },
    })
    expect(JSON.stringify(r)).not.toContain('4242424242424242')
    expect(JSON.stringify(r)).not.toContain('userId')
  })
})
