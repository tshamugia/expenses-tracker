import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPrisma,
  mockGenerate,
  mockNotifyReady,
  mockNotifyClose,
  mockClosePlan,
  mockNotifyClosed,
} = vi.hoisted(() => ({
  mockPrisma: {
    goal: { findMany: vi.fn() },
    monthlyPlan: { findUnique: vi.fn(), findMany: vi.fn() },
  },
  mockGenerate: vi.fn(),
  mockNotifyReady: vi.fn(),
  mockNotifyClose: vi.fn(),
  mockClosePlan: vi.fn(),
  mockNotifyClosed: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/services/plan-generation', () => ({ generatePlanForUser: mockGenerate }))
vi.mock('@/lib/services/plan-close', () => ({ closePlanForUser: mockClosePlan }))
vi.mock('@/lib/services/notification-service', () => ({
  notifyPlanReady: mockNotifyReady,
  notifyMonthCloseReminder: mockNotifyClose,
  notifyMonthClosed: mockNotifyClosed,
}))

import {
  autoCloseElapsedMonths,
  generateMonthlyPlansForAllUsers,
  sendMonthCloseReminders,
} from './plan-cron'

const NOW = new Date(2026, 8, 1) // 1 Sep 2026 (30-day month)

beforeEach(() => {
  vi.clearAllMocks()
  mockNotifyReady.mockResolvedValue({ success: true })
  mockNotifyClose.mockResolvedValue({ success: true })
  mockNotifyClosed.mockResolvedValue({ success: true })
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

describe('autoCloseElapsedMonths', () => {
  it('queries only CONFIRMED plans from months before the current one', async () => {
    mockPrisma.monthlyPlan.findMany.mockResolvedValue([])
    await autoCloseElapsedMonths(NOW)
    expect(mockPrisma.monthlyPlan.findMany).toHaveBeenCalledWith({
      where: { status: 'CONFIRMED', month: { lt: '2026-09' } },
      select: { id: true, userId: true, month: true },
    })
  })

  it('closes each elapsed plan and sends the summary digest', async () => {
    mockPrisma.monthlyPlan.findMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', month: '2026-08' },
      { id: 'p2', userId: 'u2', month: '2026-08' },
    ])
    mockClosePlan.mockResolvedValue({
      ok: true,
      data: { verdict: { kind: 'FORWARD', netChange: 410 }, achieved: true, defaultCurrency: 'GEL' },
    })

    const count = await autoCloseElapsedMonths(NOW)
    expect(count).toBe(2)
    expect(mockClosePlan).toHaveBeenCalledWith('u1', 'p1')
    expect(mockNotifyClosed).toHaveBeenCalledTimes(2)
    expect(mockNotifyClosed).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ month: '2026-08', verdict: 'FORWARD' })
    )
  })

  it('skips a plan the close core rejects (e.g. already closed) without counting it', async () => {
    mockPrisma.monthlyPlan.findMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', month: '2026-08' },
    ])
    mockClosePlan.mockResolvedValue({ ok: false, error: 'This month is already closed' })

    const count = await autoCloseElapsedMonths(NOW)
    expect(count).toBe(0)
    expect(mockNotifyClosed).not.toHaveBeenCalled()
  })

  it('survives a per-plan close failure', async () => {
    mockPrisma.monthlyPlan.findMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', month: '2026-08' },
      { id: 'p2', userId: 'u2', month: '2026-07' },
    ])
    mockClosePlan
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        ok: true,
        data: { verdict: { kind: 'BACK', netChange: -120 }, achieved: false, defaultCurrency: 'GEL' },
      })

    const count = await autoCloseElapsedMonths(NOW)
    expect(count).toBe(1)
    expect(mockNotifyClosed).toHaveBeenCalledTimes(1)
  })
})
