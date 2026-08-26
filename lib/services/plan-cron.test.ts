import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockGenerate, mockNotifyReady, mockNotifyClose } = vi.hoisted(() => ({
  mockPrisma: {
    goal: { findMany: vi.fn() },
    monthlyPlan: { findUnique: vi.fn(), findMany: vi.fn() },
  },
  mockGenerate: vi.fn(),
  mockNotifyReady: vi.fn(),
  mockNotifyClose: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/plan-generation', () => ({ generatePlanForUser: mockGenerate }))
vi.mock('@/lib/services/notification-service', () => ({
  notifyPlanReady: mockNotifyReady,
  notifyMonthCloseReminder: mockNotifyClose,
}))

import {
  generateMonthlyPlansForAllUsers,
  sendMonthCloseReminders,
} from './plan-cron'

const NOW = new Date(2026, 8, 1) // 1 Sep 2026 (30-day month)

beforeEach(() => {
  vi.clearAllMocks()
  mockNotifyReady.mockResolvedValue({ success: true })
  mockNotifyClose.mockResolvedValue({ success: true })
})

describe('generateMonthlyPlansForAllUsers', () => {
  it('generates for each active user and sends the ready digest, skipping confirmed months', async () => {
    mockPrisma.goal.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])
    mockGenerate
      .mockResolvedValueOnce({ planId: 'p1', skipped: false })
      .mockResolvedValueOnce({ planId: null, skipped: true, reason: 'confirmed' })
    mockPrisma.monthlyPlan.findUnique.mockResolvedValue({ safeToSpend: 750, currency: 'GEL' })

    const count = await generateMonthlyPlansForAllUsers(NOW)
    expect(count).toBe(1)
    expect(mockNotifyReady).toHaveBeenCalledTimes(1)
    expect(mockNotifyReady).toHaveBeenCalledWith('u1', expect.objectContaining({ month: '2026-09' }))
  })

  it('deduplicates users and survives a per-user failure', async () => {
    mockPrisma.goal.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u1' }])
    mockGenerate.mockRejectedValue(new Error('boom'))
    const count = await generateMonthlyPlansForAllUsers(NOW)
    expect(count).toBe(0)
    expect(mockGenerate).toHaveBeenCalledTimes(1) // deduped
  })
})

describe('sendMonthCloseReminders', () => {
  it('is a no-op outside the last-days window', async () => {
    const midMonth = new Date(2026, 8, 10)
    const count = await sendMonthCloseReminders(midMonth)
    expect(count).toBe(0)
    expect(mockPrisma.monthlyPlan.findMany).not.toHaveBeenCalled()
  })

  it('reminds users with an open confirmed plan in the last days', async () => {
    const lastDay = new Date(2026, 8, 30) // daysLeft = 0
    mockPrisma.monthlyPlan.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])
    const count = await sendMonthCloseReminders(lastDay)
    expect(count).toBe(2)
    expect(mockNotifyClose).toHaveBeenCalledTimes(2)
  })
})
