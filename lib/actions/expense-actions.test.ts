import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    expense: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    category: { findFirst: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification-service', () => ({
  notifyPastOrOverdueExpense: vi.fn(),
}))
vi.mock('@/lib/db/expense-queries', () => ({
  findExpensesByUserId: vi.fn(),
  findExpensesWithFilters: vi.fn(),
  findExpenseById: vi.fn(),
  findExpensesByDateRange: vi.fn(),
  findOverdueExpenses: vi.fn(),
  findExpenseCategories: vi.fn(),
}))

import { markExpensePaid } from './expense-actions'

const USER_ID = 'user-1'
const EXPENSE = {
  id: 'exp-1',
  userId: USER_ID,
  title: 'ბინის ქირა',
  amount: 800,
  currency: 'GEL',
  category: 'ბინა/კომუნალური',
  isRecurring: false,
  recurrenceRule: null,
  nextDueDate: new Date('2026-08-05'),
}
const PAYMENT = {
  id: 'pay-1',
  expenseId: 'exp-1',
  dueDate: new Date('2026-08-05'),
  amount: 800,
  paid: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.expense.findFirst.mockResolvedValue(EXPENSE)
  mockPrisma.payment.findFirst.mockResolvedValue(PAYMENT)
  mockPrisma.category.findFirst.mockResolvedValue({ id: 'cat-1' })
  mockPrisma.$transaction.mockResolvedValue([{}, {}])
  mockPrisma.expense.findUnique.mockResolvedValue({
    ...EXPENSE,
    payments: [{ ...PAYMENT, paid: true }],
  })
})

describe('markExpensePaid', () => {
  it("rejects an expense the user doesn't own", async () => {
    mockPrisma.expense.findFirst.mockResolvedValue(null)

    const result = await markExpensePaid('exp-1', USER_ID)

    expect(result.success).toBe(false)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('fails when there is no unpaid payment', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null)

    const result = await markExpensePaid('exp-1', USER_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no unpaid payment/i)
  })

  it('marks the payment paid AND writes the ledger entry in one $transaction', async () => {
    const result = await markExpensePaid('exp-1', USER_ID)

    expect(result.success).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: expect.objectContaining({ paid: true }),
    })
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'EXPENSE',
        amount: 800,
        currency: 'GEL',
        categoryId: 'cat-1',
        expenseId: 'exp-1',
        entrySource: 'MANUAL',
      }),
    })
  })

  it('links the ledger entry without a category when the expense has none', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({ ...EXPENSE, category: null })

    const result = await markExpensePaid('exp-1', USER_ID)

    expect(result.success).toBe(true)
    expect(mockPrisma.category.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoryId: null }),
    })
  })

  it('fails as a whole when the atomic write fails — neither record persists', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('db down'))

    const result = await markExpensePaid('exp-1', USER_ID)

    expect(result.success).toBe(false)
    expect(result.error).toBe('db down')
    // payment must not be re-marked outside the failed transaction
    expect(mockPrisma.expense.update).not.toHaveBeenCalled()
  })
})
