import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockSendMilestone, mockSendPush } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
  mockSendMilestone: vi.fn(),
  mockSendPush: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('./email', () => ({
  sendCategoryLimitEmail: vi.fn(),
  sendPaymentReminderEmail: vi.fn(),
  sendGoalMilestoneEmail: mockSendMilestone,
}))
vi.mock('./push-service', () => ({ sendPushToUser: mockSendPush }))

import {
  notifyGoalAchieved,
  notifyReserveStageReached,
  notifyReserveTargetChanged,
  notifyReserveWithdrawal,
} from './notification-service'

const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue({
    email: 'user@example.com',
    name: 'Giorgi',
  })
  mockPrisma.notification.create.mockResolvedValue({ id: 'ntf-1' })
  mockSendMilestone.mockResolvedValue({ success: true })
  mockSendPush.mockResolvedValue(undefined)
})

describe('notifyGoalAchieved', () => {
  it('creates a success notification, pushes and emails', async () => {
    const result = await notifyGoalAchieved(USER_ID, 'New laptop')

    expect(result.success).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'success',
        actionUrl: '/goals',
        message: expect.stringContaining('New laptop'),
      }),
    })
    expect(mockSendPush).toHaveBeenCalled()
    expect(mockSendMilestone).toHaveBeenCalled()
  })
})

describe('notifyReserveStageReached', () => {
  it('creates a milestone notification for stage 1', async () => {
    const result = await notifyReserveStageReached(USER_ID, 1)

    expect(result.success).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'success',
        metadata: expect.stringContaining('reserve-stage'),
      }),
    })
    expect(mockSendMilestone).toHaveBeenCalled()
  })
})

describe('notifyReserveWithdrawal', () => {
  it('records a warning notification with the reason, no email', async () => {
    const result = await notifyReserveWithdrawal(USER_ID, {
      goalName: 'Emergency fund',
      amount: 200,
      currency: 'GEL',
      reason: 'Car repair',
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('Car repair'),
      }),
    })
    expect(mockSendMilestone).not.toHaveBeenCalled()
  })
})

describe('notifyReserveTargetChanged', () => {
  it('uses the "up" copy when the target increased', async () => {
    await notifyReserveTargetChanged(USER_ID, {
      oldTarget: 2000,
      newTarget: 2400,
      currency: 'GEL',
    })

    const data = mockPrisma.notification.create.mock.calls[0][0].data
    expect(data.type).toBe('info')
    expect(data.message).toContain('2000.00')
    expect(data.message).toContain('2400.00')
  })
})
