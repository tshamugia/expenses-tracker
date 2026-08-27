import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockSendEmail, mockSendPush } = vi.hoisted(() => ({
  mockPrisma: {
    notification: { findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  mockSendEmail: vi.fn(),
  mockSendPush: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('./email', () => ({
  sendCategoryLimitEmail: mockSendEmail,
  sendPaymentReminderEmail: vi.fn(),
}))
vi.mock('./push-service', () => ({ sendPushToUser: mockSendPush }))

import { notifyCategoryLimitThreshold } from './notification-service'

const USER_ID = 'user-1'
const CATEGORY = { id: 'cat-1', name: 'კვება' }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.notification.findFirst.mockResolvedValue(null)
  mockPrisma.notification.create.mockResolvedValue({ id: 'ntf-1' })
  mockPrisma.user.findUnique.mockResolvedValue({
    email: 'user@example.com',
    name: 'გიორგი',
  })
  mockSendEmail.mockResolvedValue({ success: true })
  mockSendPush.mockResolvedValue(undefined)
})

describe('notifyCategoryLimitThreshold', () => {
  it('does nothing below the 80% threshold', async () => {
    const result = await notifyCategoryLimitThreshold(
      USER_ID,
      CATEGORY,
      { spent: 300, limit: 500, ratio: 0.6 },
      'GEL'
    )

    expect(result).toEqual({ success: true, notified: false })
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('sends in-app + email at the 80% threshold (84%)', async () => {
    const result = await notifyCategoryLimitThreshold(
      USER_ID,
      CATEGORY,
      { spent: 420, limit: 500, ratio: 0.84 },
      'GEL'
    )

    expect(result).toEqual({ success: true, notified: true })
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'warning',
        message: expect.stringContaining('84%'),
      }),
    })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        categoryName: 'კვება',
        spent: 420,
        limit: 500,
        percent: 84,
      })
    )
  })

  it('sends an "over" notification past 100% (101%)', async () => {
    const result = await notifyCategoryLimitThreshold(
      USER_ID,
      CATEGORY,
      { spent: 505, limit: 500, ratio: 1.01 },
      'GEL'
    )

    expect(result.notified).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'error' }),
    })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 101 })
    )
  })

  it('sends at most one notification per threshold per category per month', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing' })

    const result = await notifyCategoryLimitThreshold(
      USER_ID,
      CATEGORY,
      { spent: 430, limit: 500, ratio: 0.86 },
      'GEL'
    )

    expect(result).toEqual({ success: true, notified: false })
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('exactly 100% counts as the 80% threshold (warning, not over)', async () => {
    const result = await notifyCategoryLimitThreshold(
      USER_ID,
      CATEGORY,
      { spent: 500, limit: 500, ratio: 1 },
      'GEL'
    )

    expect(result.notified).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'warning' }),
    })
  })

  it('still records the in-app notification when the user lookup fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await notifyCategoryLimitThreshold(
      USER_ID,
      CATEGORY,
      { spent: 420, limit: 500, ratio: 0.84 },
      'GEL'
    )

    expect(result.notified).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
