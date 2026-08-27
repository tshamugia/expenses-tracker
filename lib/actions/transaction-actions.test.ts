import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockNotify, mockStatus } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: {
    category: { findFirst: vi.fn() },
    transaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockNotify: vi.fn(),
  mockStatus: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification-service', () => ({
  notifyCategoryLimitThreshold: mockNotify,
}))
vi.mock('@/lib/services/spend-status-service', () => ({
  computeSingleCategoryStatus: mockStatus,
}))

import {
  deleteTransaction,
  getTransactions,
  quickAddExpense,
} from './transaction-actions'

const USER_ID = 'user-1'
const CATEGORY = { id: 'cat-1', userId: USER_ID, categoryName: 'კვება' }

const makeTransaction = (overrides = {}) => ({
  id: 'tx-1',
  userId: USER_ID,
  type: 'EXPENSE',
  amount: 18,
  currency: 'GEL',
  date: new Date('2026-08-20'),
  categoryId: 'cat-1',
  incomeSourceId: null,
  expenseId: null,
  description: null,
  entrySource: 'MANUAL',
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
  mockStatus.mockResolvedValue({
    status: { categoryId: 'cat-1', spent: 18, limit: 500, ratio: 0.036, level: 'ok' },
    context: { defaultCurrency: 'GEL', usdRate: null, eurRate: null },
  })
})

describe('quickAddExpense', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)

    const result = await quickAddExpense({ amount: 18, categoryId: 'cat-1' })

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it.each([[0], [-5], [NaN]])('rejects non-positive amount %s', async (amount) => {
    const result = await quickAddExpense({ amount, categoryId: 'cat-1' })

    expect(result.success).toBe(false)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it("rejects a category the user doesn't own", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null)

    const result = await quickAddExpense({ amount: 18, categoryId: 'cat-x' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found or access denied/i)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it('creates the transaction and returns the category status', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(CATEGORY)
    mockPrisma.transaction.create.mockResolvedValue(makeTransaction())

    const result = await quickAddExpense({
      amount: 18,
      categoryId: 'cat-1',
      description: '  ლანჩი  ',
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'EXPENSE',
        amount: 18,
        currency: 'GEL',
        categoryId: 'cat-1',
        description: 'ლანჩი',
        entrySource: 'MANUAL',
      }),
    })
    expect(result.data?.transaction.amount).toBe(18)
    expect(result.data?.categoryStatus).toMatchObject({
      categoryId: 'cat-1',
      level: 'ok',
      categoryName: 'კვება',
    })
  })

  it('triggers the limit notification when the category has a limit', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(CATEGORY)
    mockPrisma.transaction.create.mockResolvedValue(makeTransaction({ amount: 420 }))
    mockStatus.mockResolvedValue({
      status: { categoryId: 'cat-1', spent: 420, limit: 500, ratio: 0.84, level: 'warning' },
      context: { defaultCurrency: 'GEL', usdRate: null, eurRate: null },
    })

    const result = await quickAddExpense({ amount: 420, categoryId: 'cat-1' })

    expect(result.success).toBe(true)
    expect(mockNotify).toHaveBeenCalledWith(
      USER_ID,
      { id: 'cat-1', name: 'კვება' },
      { spent: 420, limit: 500, ratio: 0.84 },
      'GEL'
    )
  })

  it('skips the notification when the category has no limit', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(CATEGORY)
    mockPrisma.transaction.create.mockResolvedValue(makeTransaction())
    mockStatus.mockResolvedValue({
      status: { categoryId: 'cat-1', spent: 18, limit: null, ratio: null, level: 'ok' },
      context: { defaultCurrency: 'GEL', usdRate: null, eurRate: null },
    })

    const result = await quickAddExpense({ amount: 18, categoryId: 'cat-1' })

    expect(result.success).toBe(true)
    expect(mockNotify).not.toHaveBeenCalled()
  })
})

describe('getTransactions', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)

    const result = await getTransactions()

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('filters by type/category/period and paginates', async () => {
    const tx = makeTransaction({
      category: { categoryName: 'კვება', color: '#10b981' },
      incomeSource: null,
    })
    mockPrisma.$transaction.mockResolvedValue([[tx], 41])

    const from = new Date('2026-08-01')
    const to = new Date('2026-08-31')
    const result = await getTransactions({
      type: 'EXPENSE',
      categoryId: 'cat-1',
      from,
      to,
      page: 2,
      pageSize: 20,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ totalCount: 41, page: 2, pageSize: 20 })
    expect(result.data?.items[0]).toMatchObject({
      id: 'tx-1',
      amount: 18,
      categoryName: 'კვება',
    })
    expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_ID,
          type: 'EXPENSE',
          categoryId: 'cat-1',
          date: { gte: from, lte: to },
        },
        skip: 20,
        take: 20,
      })
    )
  })
})

describe('deleteTransaction', () => {
  it("rejects deleting another user's transaction", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null)

    const result = await deleteTransaction('tx-1')

    expect(result.success).toBe(false)
    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled()
  })

  it('deletes an owned transaction', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction())
    mockPrisma.transaction.delete.mockResolvedValue(makeTransaction())

    const result = await deleteTransaction('tx-1')

    expect(result.success).toBe(true)
    expect(mockPrisma.transaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } })
  })
})
