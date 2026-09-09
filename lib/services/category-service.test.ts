import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    category: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    expense: { count: vi.fn() },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))

import {
  createCategoryForUser,
  deleteCategoryForUser,
  serializeCategory,
  updateCategoryForUser,
} from './category-service'

const USER = 'user-1'
const decimal = (n: number) => ({ toString: () => String(n), valueOf: () => n })

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  userId: USER,
  categoryName: 'Food',
  color: '#10b981',
  kind: 'VARIABLE',
  monthlyLimit: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createCategoryForUser', () => {
  it('validates name, colour, kind and limit before touching the DB', async () => {
    expect(await createCategoryForUser(USER, { categoryName: '   ' })).toEqual({ ok: false, error: 'Category name is required' })
    expect((await createCategoryForUser(USER, { categoryName: 'x'.repeat(51) })).ok).toBe(false)
    expect(await createCategoryForUser(USER, { categoryName: 'Food', color: 'green' })).toEqual({
      ok: false,
      error: 'Color must be a hex value like #3b82f6',
    })
    expect(await createCategoryForUser(USER, { categoryName: 'Food', kind: 'OTHER' as never })).toEqual({
      ok: false,
      error: 'Kind must be FIXED or VARIABLE',
    })
    expect(await createCategoryForUser(USER, { categoryName: 'Food', monthlyLimit: 0 })).toEqual({
      ok: false,
      error: 'Limit must be greater than zero',
    })
    expect(mockPrisma.category.create).not.toHaveBeenCalled()
  })

  it('rejects a duplicate name (case-insensitive, per user)', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(row())
    const r = await createCategoryForUser(USER, { categoryName: 'food' })
    expect(r).toEqual({ ok: false, error: 'A category with this name already exists' })
    expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
      where: { userId: USER, categoryName: { equals: 'food', mode: 'insensitive' } },
    })
  })

  it('creates with defaults (VARIABLE, blue, no limit) and serializes the limit', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null)
    mockPrisma.category.create.mockResolvedValue(row({ monthlyLimit: decimal(300) }))

    const r = await createCategoryForUser(USER, { categoryName: ' Food ', monthlyLimit: 300 })

    expect(mockPrisma.category.create).toHaveBeenCalledWith({
      data: { userId: USER, categoryName: 'Food', color: '#3b82f6', kind: 'VARIABLE', monthlyLimit: 300 },
    })
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ id: 'c1', monthlyLimit: 300 }) })
  })

  it('stores an explicit FIXED kind', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null)
    mockPrisma.category.create.mockResolvedValue(row({ kind: 'FIXED' }))
    await createCategoryForUser(USER, { categoryName: 'Rent', kind: 'FIXED', color: '#3b82f6' })
    expect(mockPrisma.category.create.mock.calls[0][0].data.kind).toBe('FIXED')
  })
})

describe('updateCategoryForUser', () => {
  it("rejects another user's category", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null)
    const r = await updateCategoryForUser(USER, 'c1', { categoryName: 'X' })
    expect(r.ok).toBe(false)
    expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', userId: USER } })
    expect(mockPrisma.category.update).not.toHaveBeenCalled()
  })

  it('rejects renaming onto another existing category', async () => {
    mockPrisma.category.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ id: 'c2', categoryName: 'Transport' }))
    const r = await updateCategoryForUser(USER, 'c1', { categoryName: 'transport' })
    expect(r).toEqual({ ok: false, error: 'A category with this name already exists' })
    expect(mockPrisma.category.findFirst.mock.calls[1][0].where.NOT).toEqual({ id: 'c1' })
  })

  it('updates kind and clears the limit with null; untouched fields stay undefined', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(row())
    mockPrisma.category.update.mockResolvedValue(row({ kind: 'FIXED', monthlyLimit: null }))

    const r = await updateCategoryForUser(USER, 'c1', { kind: 'FIXED', monthlyLimit: null })

    expect(mockPrisma.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { categoryName: undefined, color: undefined, kind: 'FIXED', monthlyLimit: null },
    })
    expect(r.ok).toBe(true)
  })

  it('validates the new limit', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(row())
    expect(await updateCategoryForUser(USER, 'c1', { monthlyLimit: -5 })).toEqual({ ok: false, error: 'Limit must be greater than zero' })
  })
})

describe('deleteCategoryForUser', () => {
  it('refuses while fixed bills still use the category', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(row())
    mockPrisma.expense.count.mockResolvedValue(2)
    const r = await deleteCategoryForUser(USER, 'c1')
    expect(r.ok).toBe(false)
    expect(mockPrisma.expense.count).toHaveBeenCalledWith({ where: { userId: USER, category: 'Food' } })
    expect(mockPrisma.category.delete).not.toHaveBeenCalled()
  })

  it('deletes an owned, unused category', async () => {
    mockPrisma.category.findFirst.mockResolvedValue(row())
    mockPrisma.expense.count.mockResolvedValue(0)
    expect(await deleteCategoryForUser(USER, 'c1')).toEqual({ ok: true, data: undefined })
    expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })

  it("rejects another user's category", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null)
    expect((await deleteCategoryForUser(USER, 'c1')).ok).toBe(false)
    expect(mockPrisma.category.delete).not.toHaveBeenCalled()
  })
})

describe('serializeCategory', () => {
  it('converts the Decimal limit to a number and keeps null', () => {
    expect(serializeCategory(row({ monthlyLimit: decimal(12.5) }) as never).monthlyLimit).toBe(12.5)
    expect(serializeCategory(row() as never).monthlyLimit).toBeNull()
  })
})
