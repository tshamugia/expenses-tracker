import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    transaction: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    category: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))

import { deleteTransactionForUser, updateTransactionForUser } from './transaction-service'

const USER = 'user-1'
const decimal = (n: number) => ({ toString: () => String(n), valueOf: () => n })
const tx = { id: 't1', userId: USER, type: 'EXPENSE', amount: decimal(18), currency: 'GEL', date: new Date('2026-09-01'), categoryId: 'c1', description: null }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateTransactionForUser', () => {
  it("rejects another user's transaction", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null)
    expect(await updateTransactionForUser(USER, 't1', { amount: 5 })).toEqual({ ok: false, error: 'Transaction not found or access denied' })
    expect(mockPrisma.transaction.findFirst).toHaveBeenCalledWith({ where: { id: 't1', userId: USER } })
  })

  it('validates amount, currency, date and category ownership', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(tx)
    expect(await updateTransactionForUser(USER, 't1', { amount: 0 })).toEqual({ ok: false, error: 'Amount must be greater than zero' })
    expect(await updateTransactionForUser(USER, 't1', { currency: 'BTC' })).toEqual({ ok: false, error: 'Unsupported currency' })
    expect(await updateTransactionForUser(USER, 't1', { date: new Date('nope') })).toEqual({ ok: false, error: 'Invalid date' })

    mockPrisma.category.findFirst.mockResolvedValue(null)
    expect(await updateTransactionForUser(USER, 't1', { categoryId: 'foreign' })).toEqual({ ok: false, error: 'Category not found or access denied' })
    expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', userId: USER } })
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled()
  })

  it('updates the given fields and serializes the amount; null clears the category', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(tx)
    mockPrisma.transaction.update.mockResolvedValue({ ...tx, amount: decimal(25), categoryId: null })

    const r = await updateTransactionForUser(USER, 't1', { amount: 25, categoryId: null, description: 'lunch' })

    expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { amount: 25, currency: undefined, date: undefined, categoryId: null, description: 'lunch' },
    })
    expect(mockPrisma.category.findFirst).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ id: 't1', amount: 25, categoryId: null }) })
  })
})

describe('deleteTransactionForUser', () => {
  it('deletes only an owned transaction', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null)
    expect((await deleteTransactionForUser(USER, 't1')).ok).toBe(false)
    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled()

    mockPrisma.transaction.findFirst.mockResolvedValue(tx)
    expect(await deleteTransactionForUser(USER, 't1')).toEqual({ ok: true, data: undefined })
    expect(mockPrisma.transaction.delete).toHaveBeenCalledWith({ where: { id: 't1' } })
  })
})
