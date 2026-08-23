import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchedule, type ScheduleRow } from '@/lib/services/amortization'

const { mockAuth, mockPrisma, mockContext, mockPaidOff } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockContext: vi.fn(),
  mockPaidOff: vi.fn(),
  mockPrisma: {
    debt: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    debtScheduleItem: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/spend-status-service', () => ({
  getCurrencyContext: mockContext,
}))
vi.mock('@/lib/services/notification-service', () => ({
  notifyDebtPaidOff: mockPaidOff,
}))

import {
  applyPrepayment,
  archiveDebt,
  createDebt,
  getDebtDetail,
  getDebts,
  recordDebtPayment,
  simulatePrepayment,
  updateDebt,
} from './debt-actions'

const USER_ID = 'user-1'
const FIRST_DATE = new Date(2026, 0, 15)

// A stored-schedule fixture built from the real engine, with the first
// `paidCount` installments marked paid.
function scheduleFixture(
  principal: number,
  rate: number,
  term: number,
  paidCount = 0
) {
  return buildSchedule({
    principal,
    annualRatePct: rate,
    termMonths: term,
    firstPaymentDate: FIRST_DATE,
  }).map((row: ScheduleRow, i) => ({
    id: `item-${row.seq}`,
    debtId: 'debt-1',
    seq: row.seq,
    dueDate: row.dueDate,
    payment: row.payment,
    interestPart: row.interestPart,
    principalPart: row.principalPart,
    remainingPrincipal: row.remainingPrincipal,
    paid: i < paidCount,
    paidAt: i < paidCount ? new Date() : null,
    paidAmount: i < paidCount ? row.payment : null,
    transactionId: null,
  }))
}

function makeDebt(overrides = {}) {
  return {
    id: 'debt-1',
    userId: USER_ID,
    name: 'Consumer loan',
    principal: 5000,
    annualRatePct: 18,
    termMonths: 24,
    monthlyPayment: 249.62,
    currency: 'GEL',
    firstPaymentDate: FIRST_DATE,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
  mockContext.mockResolvedValue({
    defaultCurrency: 'GEL',
    usdRate: null,
    eurRate: null,
  })
  mockPaidOff.mockResolvedValue({ success: true })
  // Run the $transaction callback against the same mock (tx === prisma)
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mockPrisma)
  )
})

describe('createDebt', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    const result = await createDebt({
      name: 'x',
      principal: 5000,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
      termMonths: 24,
    })
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects providing both term and payment', async () => {
    const result = await createDebt({
      name: 'x',
      principal: 5000,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
      termMonths: 24,
      monthlyPayment: 300,
    })
    expect(result.success).toBe(false)
    expect(mockPrisma.debt.create).not.toHaveBeenCalled()
  })

  it('rejects providing neither term nor payment', async () => {
    const result = await createDebt({
      name: 'x',
      principal: 5000,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-positive principal', async () => {
    const result = await createDebt({
      name: 'x',
      principal: 0,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
      termMonths: 24,
    })
    expect(result.success).toBe(false)
  })

  it('from a term, computes the annuity and writes exactly termMonths rows', async () => {
    mockPrisma.debt.create.mockResolvedValue(makeDebt())
    mockPrisma.debtScheduleItem.createMany.mockResolvedValue({ count: 24 })

    const result = await createDebt({
      name: 'Consumer loan',
      principal: 5000,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
      termMonths: 24,
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.debt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        termMonths: 24,
        monthlyPayment: 249.62,
      }),
    })
    const createManyArg = mockPrisma.debtScheduleItem.createMany.mock.calls[0][0]
    expect(createManyArg.data).toHaveLength(24)
    expect(createManyArg.data[23].remainingPrincipal).toBe(0)
  })

  it('from a monthly payment, computes the term (schedule length)', async () => {
    mockPrisma.debt.create.mockResolvedValue(makeDebt({ termMonths: 20, monthlyPayment: 300 }))
    mockPrisma.debtScheduleItem.createMany.mockResolvedValue({ count: 20 })

    const result = await createDebt({
      name: 'Consumer loan',
      principal: 5000,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
      monthlyPayment: 300,
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.debt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ termMonths: 20, monthlyPayment: 300 }),
    })
  })

  it('rejects a monthly payment that never amortizes', async () => {
    const result = await createDebt({
      name: 'Consumer loan',
      principal: 5000,
      annualRatePct: 18,
      firstPaymentDate: FIRST_DATE,
      monthlyPayment: 50,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/never be paid off/i)
    expect(mockPrisma.debt.create).not.toHaveBeenCalled()
  })
})

describe('recordDebtPayment', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    const result = await recordDebtPayment('item-1')
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects a missing installment', async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue(null)
    const result = await recordDebtPayment('item-x')
    expect(result.success).toBe(false)
  })

  it('rejects an already-paid installment', async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue({
      id: 'item-1',
      debtId: 'debt-1',
      paid: true,
      payment: 249.62,
      debt: makeDebt(),
    })
    const result = await recordDebtPayment('item-1')
    expect(result.success).toBe(false)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it('marks paid + writes a ledger EXPENSE atomically (not the last row)', async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue({
      id: 'item-1',
      debtId: 'debt-1',
      paid: false,
      payment: 249.62,
      debt: makeDebt(),
    })
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' })
    mockPrisma.debtScheduleItem.update.mockResolvedValue({})
    mockPrisma.debtScheduleItem.count.mockResolvedValue(23) // still unpaid rows

    const result = await recordDebtPayment('item-1')

    expect(result.success).toBe(true)
    expect(result.data?.paidOff).toBe(false)
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'EXPENSE',
        amount: 249.62,
        currency: 'GEL',
      }),
    })
    expect(mockPrisma.debtScheduleItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({ paid: true, transactionId: 'tx-1' }),
      })
    )
    expect(mockPrisma.debt.update).not.toHaveBeenCalled()
    expect(mockPaidOff).not.toHaveBeenCalled()
  })

  it('closes the debt (PAID_OFF + milestone) on the final installment', async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue({
      id: 'item-24',
      debtId: 'debt-1',
      paid: false,
      payment: 249.62,
      debt: makeDebt(),
    })
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' })
    mockPrisma.debtScheduleItem.update.mockResolvedValue({})
    mockPrisma.debtScheduleItem.count.mockResolvedValue(0) // none left

    const result = await recordDebtPayment('item-24')

    expect(result.success).toBe(true)
    expect(result.data?.paidOff).toBe(true)
    expect(mockPrisma.debt.update).toHaveBeenCalledWith({
      where: { id: 'debt-1' },
      data: { status: 'PAID_OFF' },
    })
    expect(mockPaidOff).toHaveBeenCalledWith(USER_ID, 'Consumer loan')
  })

  it('uses the actual amount when provided (prepayment differs from installment)', async () => {
    mockPrisma.debtScheduleItem.findFirst.mockResolvedValue({
      id: 'item-1',
      debtId: 'debt-1',
      paid: false,
      payment: 249.62,
      debt: makeDebt(),
    })
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' })
    mockPrisma.debtScheduleItem.update.mockResolvedValue({})
    mockPrisma.debtScheduleItem.count.mockResolvedValue(23)

    await recordDebtPayment('item-1', { amount: 500 })

    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 500 }),
    })
  })
})

describe('simulatePrepayment', () => {
  it('is read-only and returns months/interest saved', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(
      makeDebt({ schedule: scheduleFixture(5000, 18, 24, 0) })
    )

    const result = await simulatePrepayment('debt-1', {
      type: 'lump_sum',
      amount: 2000,
    })

    expect(result.success).toBe(true)
    expect(result.data?.monthsSaved).toBeGreaterThan(0)
    expect(result.data?.interestSaved).toBeGreaterThan(0)
    expect(mockPrisma.debtScheduleItem.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.debtScheduleItem.createMany).not.toHaveBeenCalled()
  })

  it('rejects a non-positive amount', async () => {
    const result = await simulatePrepayment('debt-1', {
      type: 'lump_sum',
      amount: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('applyPrepayment', () => {
  it('regenerates only the unpaid tail; paid rows are left untouched', async () => {
    // 3 of 24 installments already paid
    const schedule = scheduleFixture(5000, 18, 24, 3)
    mockPrisma.debt.findFirst.mockResolvedValue(makeDebt({ schedule }))
    mockPrisma.debtScheduleItem.deleteMany.mockResolvedValue({ count: 21 })
    mockPrisma.debtScheduleItem.createMany.mockResolvedValue({ count: 10 })
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' })
    mockPrisma.debt.update.mockResolvedValue(makeDebt())

    const result = await applyPrepayment('debt-1', {
      type: 'lump_sum',
      amount: 2000,
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.debtScheduleItem.deleteMany).toHaveBeenCalledWith({
      where: { debtId: 'debt-1', paid: false },
    })
    // Regenerated rows all start at the current seq (4) or later
    const createManyArg = mockPrisma.debtScheduleItem.createMany.mock.calls[0][0]
    expect(createManyArg.data[0].seq).toBe(4)
    // Lump sum books a ledger EXPENSE
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'EXPENSE', amount: 2000 }),
    })
    expect(result.data?.monthsSaved).toBeGreaterThan(0)
  })

  it('extra-monthly raises the stored payment and books no lump transaction', async () => {
    const schedule = scheduleFixture(5000, 18, 24, 0)
    mockPrisma.debt.findFirst.mockResolvedValue(makeDebt({ schedule }))
    mockPrisma.debtScheduleItem.deleteMany.mockResolvedValue({ count: 24 })
    mockPrisma.debtScheduleItem.createMany.mockResolvedValue({ count: 18 })
    mockPrisma.debt.update.mockResolvedValue(makeDebt())

    const result = await applyPrepayment('debt-1', {
      type: 'extra_monthly',
      amount: 100,
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
    expect(mockPrisma.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ monthlyPayment: 349.62 }),
      })
    )
  })

  it('rejects prepayment on a non-active debt', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(
      makeDebt({ status: 'PAID_OFF', schedule: scheduleFixture(5000, 18, 24, 24) })
    )
    const result = await applyPrepayment('debt-1', {
      type: 'lump_sum',
      amount: 1000,
    })
    expect(result.success).toBe(false)
  })
})

describe('getDebts', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    const result = await getDebts()
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('aggregates remaining principal and ranks avalanche/snowball for ≥2 debts', async () => {
    const debtA = makeDebt({
      id: 'a',
      annualRatePct: 12,
      principal: 3000,
      schedule: scheduleFixture(3000, 12, 12, 0),
    })
    const debtB = makeDebt({
      id: 'b',
      annualRatePct: 24,
      principal: 8000,
      schedule: scheduleFixture(8000, 24, 24, 0),
    })
    mockPrisma.debt.findMany.mockResolvedValue([debtA, debtB])

    const result = await getDebts()

    expect(result.success).toBe(true)
    expect(result.data?.debts).toHaveLength(2)
    // avalanche → highest rate (b); snowball → smallest balance (a)
    expect(result.data?.strategy?.avalancheFirstDebtId).toBe('b')
    expect(result.data?.strategy?.snowballFirstDebtId).toBe('a')
    expect(result.data?.totalRemainingPrincipal).toBeCloseTo(11000, 0)
    expect(result.data?.nextPayment).not.toBeNull()
  })

  it('omits the strategy block with a single debt', async () => {
    mockPrisma.debt.findMany.mockResolvedValue([
      makeDebt({ schedule: scheduleFixture(5000, 18, 24, 0) }),
    ])
    const result = await getDebts()
    expect(result.data?.strategy).toBeNull()
  })
})

describe('getDebtDetail', () => {
  it('rejects a missing debt', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(null)
    const result = await getDebtDetail('debt-x')
    expect(result.success).toBe(false)
  })

  it('returns the schedule, progress and current seq', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(
      makeDebt({ schedule: scheduleFixture(5000, 18, 24, 3) })
    )
    const result = await getDebtDetail('debt-1')

    expect(result.success).toBe(true)
    expect(result.data?.schedule).toHaveLength(24)
    expect(result.data?.currentSeq).toBe(4)
    expect(result.data?.progress.paidCount).toBe(3)
    expect(result.data?.progress.originalPrincipal).toBe(5000)
  })
})

describe('updateDebt / archiveDebt', () => {
  it('updates the name only', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(
      makeDebt({ schedule: scheduleFixture(5000, 18, 24, 0) })
    )
    mockPrisma.debt.update.mockResolvedValue(makeDebt({ name: 'Renamed' }))

    const result = await updateDebt('debt-1', { name: 'Renamed' })

    expect(result.success).toBe(true)
    expect(mockPrisma.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'debt-1' },
        data: expect.objectContaining({ name: 'Renamed' }),
      })
    )
  })

  it('rejects an empty name', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(
      makeDebt({ schedule: scheduleFixture(5000, 18, 24, 0) })
    )
    const result = await updateDebt('debt-1', { name: '   ' })
    expect(result.success).toBe(false)
  })

  it('archives a debt', async () => {
    mockPrisma.debt.findFirst.mockResolvedValue(makeDebt())
    mockPrisma.debt.update.mockResolvedValue(makeDebt({ status: 'ARCHIVED' }))

    const result = await archiveDebt('debt-1')

    expect(result.success).toBe(true)
    expect(mockPrisma.debt.update).toHaveBeenCalledWith({
      where: { id: 'debt-1' },
      data: { status: 'ARCHIVED' },
    })
  })
})
