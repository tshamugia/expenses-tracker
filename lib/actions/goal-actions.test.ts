import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAuth,
  mockPrisma,
  mockComputeMandatory,
  mockRecalc,
  mockNotifyAchieved,
  mockNotifyStage,
  mockNotifyWithdraw,
  mockTranslator,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockComputeMandatory: vi.fn(),
  mockRecalc: vi.fn(),
  mockNotifyAchieved: vi.fn(),
  mockNotifyStage: vi.fn(),
  mockNotifyWithdraw: vi.fn(),
  mockTranslator: vi.fn(),
  mockPrisma: {
    goal: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    goalContribution: {
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    notificationPreference: { findUnique: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/reserve-target-service', () => ({
  computeMandatoryMonthly: mockComputeMandatory,
  recalcReserveTargetForUser: mockRecalc,
}))
vi.mock('@/lib/services/notification-service', () => ({
  notifyGoalAchieved: mockNotifyAchieved,
  notifyReserveStageReached: mockNotifyStage,
  notifyReserveWithdrawal: mockNotifyWithdraw,
}))
vi.mock('@/i18n/server-translator', () => ({
  getServerTranslator: async () => mockTranslator,
}))

import {
  advanceReserveStage,
  archiveGoal,
  contributeToGoal,
  createGoal,
  ensureEmergencyFund,
  updateGoal,
  withdrawFromGoal,
} from './goal-actions'

const USER_ID = 'user-1'

function makeGoal(overrides = {}) {
  return {
    id: 'goal-1',
    userId: USER_ID,
    name: 'New laptop',
    targetAmount: 1500,
    currency: 'GEL',
    targetDate: null,
    monthlyContribution: null,
    priority: 2,
    status: 'ACTIVE',
    isEmergencyFund: false,
    reserveStage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
  mockComputeMandatory.mockResolvedValue({
    mandatoryMonthly: 2100,
    context: { defaultCurrency: 'GEL', usdRate: null, eurRate: null },
  })
  mockNotifyAchieved.mockResolvedValue({ success: true })
  mockNotifyStage.mockResolvedValue({ success: true })
  mockNotifyWithdraw.mockResolvedValue({ success: true })
  mockTranslator.mockImplementation((key: string) => key)
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(mockPrisma)
  )
  mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' })
  mockPrisma.goalContribution.create.mockResolvedValue({})
  mockPrisma.goal.aggregate.mockResolvedValue({ _max: { priority: 3 } })
})

describe('ensureEmergencyFund', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    const result = await ensureEmergencyFund()
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('creates the reserve when none exists', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(null)
    mockPrisma.goal.create.mockResolvedValue(makeGoal({ isEmergencyFund: true }))

    const result = await ensureEmergencyFund()

    expect(result.success).toBe(true)
    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        isEmergencyFund: true,
        priority: 1,
        reserveStage: 1,
        targetAmount: 2100, // 2100 mandatory × stage 1
      }),
    })
  })

  it('is idempotent — a second call creates nothing', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: 'reserve-1' })

    const result = await ensureEmergencyFund()

    expect(result.success).toBe(true)
    expect(mockPrisma.goal.create).not.toHaveBeenCalled()
  })
})

describe('createGoal', () => {
  it('derives and stores the monthly contribution from a target date', async () => {
    mockPrisma.goal.create.mockResolvedValue(makeGoal())
    // 4 calendar months from today
    const targetDate = new Date()
    targetDate.setMonth(targetDate.getMonth() + 4)

    const result = await createGoal({
      name: 'New laptop',
      targetAmount: 1500,
      targetDate,
    })

    expect(result.success).toBe(true)
    const data = mockPrisma.goal.create.mock.calls[0][0].data
    expect(data.targetDate).toBe(targetDate)
    expect(data.monthlyContribution).toBe(375) // 1500 / 4
    expect(data.priority).toBe(4) // max(existing 3) + 1
  })

  it('rejects a non-positive target', async () => {
    const result = await createGoal({ name: 'x', targetAmount: 0 })
    expect(result.success).toBe(false)
    expect(mockPrisma.goal.create).not.toHaveBeenCalled()
  })
})

describe('reserve protection', () => {
  it('blocks archiving the emergency fund', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true })
    )
    const result = await archiveGoal('goal-1')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cannot be deleted/i)
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })

  it('blocks editing the emergency fund', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true })
    )
    const result = await updateGoal('goal-1', { name: 'hacked' })
    expect(result.success).toBe(false)
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })
})

describe('contributeToGoal', () => {
  it('writes the contribution and ledger transaction atomically', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(makeGoal())
    mockPrisma.goalContribution.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    })

    const result = await contributeToGoal('goal-1', { amount: 200 })

    expect(result.success).toBe(true)
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'EXPENSE', amount: 200 }),
    })
    expect(mockPrisma.goalContribution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 200, transactionId: 'tx-1' }),
    })
    expect(result.data?.achieved).toBe(false)
  })

  it('marks a goal achieved and notifies when the target is crossed', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(makeGoal()) // target 1500
    mockPrisma.goalContribution.aggregate.mockResolvedValue({
      _sum: { amount: 1400 },
    })

    const result = await contributeToGoal('goal-1', { amount: 200 })

    expect(result.success).toBe(true)
    expect(result.data?.achieved).toBe(true)
    expect(mockPrisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { status: 'ACHIEVED' },
    })
    expect(mockNotifyAchieved).toHaveBeenCalledWith(USER_ID, 'New laptop')
  })

  it('fires the reserve stage milestone (staying ACTIVE) for the emergency fund', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true, reserveStage: 1, targetAmount: 2100 })
    )
    mockPrisma.goalContribution.aggregate.mockResolvedValue({
      _sum: { amount: 2000 },
    })

    const result = await contributeToGoal('goal-1', { amount: 200 })

    expect(result.success).toBe(true)
    expect(mockNotifyStage).toHaveBeenCalledWith(USER_ID, 1)
    // reserve is not flipped to ACHIEVED
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })

  it('rejects a non-positive amount', async () => {
    const result = await contributeToGoal('goal-1', { amount: 0 })
    expect(result.success).toBe(false)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })
})

describe('withdrawFromGoal', () => {
  it('requires a reason', async () => {
    const result = await withdrawFromGoal('goal-1', { amount: 50, reason: '  ' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/reason/i)
    expect(mockPrisma.goal.findFirst).not.toHaveBeenCalled()
  })

  it('rejects withdrawing more than saved', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true })
    )
    mockPrisma.goalContribution.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    })

    const result = await withdrawFromGoal('goal-1', {
      amount: 200,
      reason: 'car repair',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/more than/i)
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled()
  })

  it('records a negative contribution, an INCOME transaction and notifies', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true })
    )
    mockPrisma.goalContribution.aggregate.mockResolvedValue({
      _sum: { amount: 500 },
    })

    const result = await withdrawFromGoal('goal-1', {
      amount: 200,
      reason: 'car repair',
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'INCOME', amount: 200 }),
    })
    expect(mockPrisma.goalContribution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: -200, reason: 'car repair' }),
    })
    expect(mockNotifyWithdraw).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ reason: 'car repair', amount: 200 })
    )
  })
})

describe('advanceReserveStage', () => {
  it('retargets to 3× mandatory monthly and keeps the fund ACTIVE', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true, reserveStage: 1, targetAmount: 2100 })
    )
    mockPrisma.goal.update.mockResolvedValue(
      makeGoal({ isEmergencyFund: true, reserveStage: 3, targetAmount: 6300 })
    )

    const result = await advanceReserveStage('goal-1')

    expect(result.success).toBe(true)
    expect(mockPrisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { reserveStage: 3, targetAmount: 6300, status: 'ACTIVE' },
    })
  })

  it('rejects when already at the 3-month stage', async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(
      makeGoal({ isEmergencyFund: true, reserveStage: 3 })
    )
    const result = await advanceReserveStage('goal-1')
    expect(result.success).toBe(false)
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })
})
