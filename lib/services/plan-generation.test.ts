import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockGatherPlanInput, mockGeneratePlan } = vi.hoisted(() => ({
  mockGatherPlanInput: vi.fn(),
  mockGeneratePlan: vi.fn(),
  mockPrisma: {
    monthlyPlan: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    planAllocation: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/plan-input', () => ({
  gatherPlanInput: mockGatherPlanInput,
  toMonthKey: () => '2026-09',
}))
vi.mock('@/lib/services/plan-engine', () => ({
  generatePlan: mockGeneratePlan,
}))

import { generatePlanForUser, regenerateCurrentPlan } from './plan-generation'

const USER_ID = 'user-1'
const MONTH = '2026-09'

const gathered = {
  currency: 'GEL',
  input: {
    forecast: { total: 4000, stableTotal: 3000, variableEstimate: 1000 },
  },
}

const planResult = {
  allocations: [
    { kind: 'RESERVE', refId: 'goal-r', label: 'Reserve', planned: 300 },
    { kind: 'FREE', refId: null, label: 'Free', planned: 700 },
  ],
  safeToSpendMonth: 700,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGatherPlanInput.mockResolvedValue(gathered)
  mockGeneratePlan.mockReturnValue(planResult)
  mockPrisma.monthlyPlan.create.mockResolvedValue({ id: 'plan-1' })
  // Run the $transaction callback against the same mock (tx === prisma)
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mockPrisma)
  )
})

describe('generatePlanForUser', () => {
  it('creates a fresh active (CONFIRMED) plan when none exists', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)

    const result = await generatePlanForUser(USER_ID, MONTH)

    expect(result).toEqual({ planId: 'plan-1', skipped: false, result: planResult })
    const data = mockPrisma.monthlyPlan.create.mock.calls[0][0].data
    expect(data.status).toBe('CONFIRMED')
    expect(data.forecastIncome).toBe(4000)
    expect(data.safeToSpend).toBe(700)
    expect(data.allocations.create).toHaveLength(2)
    // A non-existent plan is never deleted first
    expect(mockPrisma.monthlyPlan.delete).not.toHaveBeenCalled()
  })

  it('regenerates (deletes + recreates) a non-closed existing plan', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'old', status: 'CONFIRMED' })

    const result = await generatePlanForUser(USER_ID, MONTH)

    expect(result.skipped).toBe(false)
    expect(mockPrisma.planAllocation.deleteMany).toHaveBeenCalledWith({ where: { planId: 'old' } })
    expect(mockPrisma.monthlyPlan.delete).toHaveBeenCalledWith({ where: { id: 'old' } })
    expect(mockPrisma.monthlyPlan.create).toHaveBeenCalled()
  })

  it('skips a CLOSED month (never touched)', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'closed', status: 'CLOSED' })

    const result = await generatePlanForUser(USER_ID, MONTH)

    expect(result).toEqual({ planId: null, skipped: true, reason: 'closed' })
    expect(mockPrisma.monthlyPlan.create).not.toHaveBeenCalled()
    expect(mockPrisma.monthlyPlan.delete).not.toHaveBeenCalled()
  })
})

describe('regenerateCurrentPlan', () => {
  it('returns true when the plan was refreshed', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)

    await expect(regenerateCurrentPlan(USER_ID)).resolves.toBe(true)
    expect(mockPrisma.monthlyPlan.create).toHaveBeenCalled()
  })

  it('returns false (no throw) for a CLOSED month', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ id: 'closed', status: 'CLOSED' })

    await expect(regenerateCurrentPlan(USER_ID)).resolves.toBe(false)
    expect(mockPrisma.monthlyPlan.create).not.toHaveBeenCalled()
  })

  it('swallows a generation error and returns false', async () => {
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue(null)
    mockGatherPlanInput.mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(regenerateCurrentPlan(USER_ID)).resolves.toBe(false)

    spy.mockRestore()
  })
})
