import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockContext, mockAccrue } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockAccrue: vi.fn(),
  mockPrisma: {
    incomeSource: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  mockContext: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/spend-status-service', () => ({
  getCurrencyContext: mockContext,
}))
vi.mock('@/lib/services/income-accrual', () => ({
  accrueStableIncomeForUser: mockAccrue,
}))

import {
  archiveIncomeSource,
  createIncomeSource,
  getIncomeOverview,
  recordIncome,
} from './income-actions'

const USER_ID = 'user-1'

const makeSource = (overrides = {}) => ({
  id: 'src-1',
  userId: USER_ID,
  name: 'ხელფასი',
  type: 'STABLE',
  expectedAmount: 3500,
  currency: 'GEL',
  expectedDay: 5,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
  mockContext.mockResolvedValue({ defaultCurrency: 'GEL', usdRate: null, eurRate: null })
  mockAccrue.mockResolvedValue(0)
})

describe('createIncomeSource', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)

    const result = await createIncomeSource({ name: 'ხელფასი', type: 'STABLE', expectedAmount: 3500 })

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects a STABLE source without expected amount', async () => {
    const result = await createIncomeSource({ name: 'ხელფასი', type: 'STABLE' })

    expect(result.success).toBe(false)
    expect(mockPrisma.incomeSource.create).not.toHaveBeenCalled()
  })

  it('rejects an empty name', async () => {
    const result = await createIncomeSource({ name: '   ', type: 'VARIABLE' })

    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range expected day', async () => {
    const result = await createIncomeSource({
      name: 'ხელფასი',
      type: 'STABLE',
      expectedAmount: 3500,
      expectedDay: 32,
    })

    expect(result.success).toBe(false)
  })

  it('creates a source and serializes the expected amount', async () => {
    mockPrisma.incomeSource.create.mockResolvedValue(makeSource())

    const result = await createIncomeSource({
      name: 'ხელფასი',
      type: 'STABLE',
      expectedAmount: 3500,
      expectedDay: 5,
    })

    expect(result.success).toBe(true)
    expect(result.data?.expectedAmount).toBe(3500)
    expect(mockPrisma.incomeSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        name: 'ხელფასი',
        type: 'STABLE',
        expectedAmount: 3500,
      }),
    })
  })
})

describe('archiveIncomeSource', () => {
  it('sets isActive to false on an owned source', async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue(makeSource())
    mockPrisma.incomeSource.update.mockResolvedValue(makeSource({ isActive: false }))

    const result = await archiveIncomeSource('src-1')

    expect(result.success).toBe(true)
    expect(mockPrisma.incomeSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'src-1' },
        data: expect.objectContaining({ isActive: false }),
      })
    )
  })

  it("rejects another user's source", async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue(null)

    const result = await archiveIncomeSource('src-x')

    expect(result.success).toBe(false)
    expect(mockPrisma.incomeSource.update).not.toHaveBeenCalled()
  })
})

describe('recordIncome', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)

    const result = await recordIncome({ amount: 900 })

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects non-positive amounts', async () => {
    const result = await recordIncome({ amount: 0 })

    expect(result.success).toBe(false)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it('creates an INCOME transaction with the right source', async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue(makeSource({ id: 'src-2', type: 'VARIABLE' }))
    mockPrisma.transaction.create.mockResolvedValue({
      id: 'tx-1',
      userId: USER_ID,
      type: 'INCOME',
      amount: 900,
      currency: 'GEL',
      date: new Date('2026-08-20'),
      incomeSourceId: 'src-2',
    })
    mockPrisma.transaction.findMany.mockResolvedValue([
      { amount: 900, currency: 'GEL' },
      { amount: 3500, currency: 'GEL' },
    ])

    const result = await recordIncome({ amount: 900, incomeSourceId: 'src-2' })

    expect(result.success).toBe(true)
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'INCOME',
        amount: 900,
        incomeSourceId: 'src-2',
        entrySource: 'MANUAL',
      }),
    })
    expect(result.data?.monthTotal).toBe(4400)
  })

  it("rejects a source belonging to someone else", async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue(null)

    const result = await recordIncome({ amount: 900, incomeSourceId: 'src-x' })

    expect(result.success).toBe(false)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it('rejects manual entries for a STABLE source (it accrues automatically)', async () => {
    mockPrisma.incomeSource.findFirst.mockResolvedValue(makeSource({ type: 'STABLE' }))

    const result = await recordIncome({ amount: 3500, incomeSourceId: 'src-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/automatically/i)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })
})

describe('getIncomeOverview', () => {
  it('builds the forecast from stable sources when there is no variable history', async () => {
    mockPrisma.incomeSource.findMany.mockResolvedValue([makeSource()])
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([]) // current-month income facts
      .mockResolvedValueOnce([]) // variable history window
    mockPrisma.transaction.count.mockResolvedValue(0)

    const result = await getIncomeOverview()

    expect(result.success).toBe(true)
    expect(result.data?.forecast).toMatchObject({
      stableTotal: 3500,
      variableEstimate: 0,
      total: 3500,
      method: 'no_history',
      monthsOfHistory: 0,
    })
    expect(result.data?.monthTotal).toBe(0)
    expect(result.data?.sources).toHaveLength(1)
  })

  it('accrues due stable income before building the overview', async () => {
    mockPrisma.incomeSource.findMany.mockResolvedValue([makeSource()])
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mockPrisma.transaction.count.mockResolvedValue(0)

    await getIncomeOverview()

    expect(mockAccrue).toHaveBeenCalledWith(USER_ID, expect.any(Date))
  })

  it('still returns the overview when accrual fails', async () => {
    mockAccrue.mockRejectedValue(new Error('db down'))
    mockPrisma.incomeSource.findMany.mockResolvedValue([makeSource()])
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mockPrisma.transaction.count.mockResolvedValue(0)

    const result = await getIncomeOverview()

    expect(result.success).toBe(true)
  })

  it('ignores inactive stable sources in the forecast', async () => {
    mockPrisma.incomeSource.findMany.mockResolvedValue([
      makeSource(),
      makeSource({ id: 'src-2', expectedAmount: 1000, isActive: false }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mockPrisma.transaction.count.mockResolvedValue(0)

    const result = await getIncomeOverview()

    expect(result.data?.forecast.stableTotal).toBe(3500)
  })
})
