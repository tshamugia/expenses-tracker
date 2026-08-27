import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockSendReminder, mockSendPush } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findMany: vi.fn() },
    debtScheduleItem: { findMany: vi.fn() },
    notification: { findFirst: vi.fn(), create: vi.fn() },
  },
  mockSendReminder: vi.fn(),
  mockSendPush: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('./email', () => ({
  sendCategoryLimitEmail: vi.fn(),
  sendPaymentReminderEmail: mockSendReminder,
}))
vi.mock('./push-service', () => ({ sendPushToUser: mockSendPush }))

import {
  notifyDebtPaidOff,
  sendUpcomingDebtNotifications,
} from './notification-service'

const USER_ID = 'user-1'

const makeItem = (overrides = {}) => ({
  id: 'item-1',
  payment: 249.62,
  dueDate: new Date(2026, 0, 12),
  debt: { id: 'debt-1', name: 'Consumer loan', currency: 'GEL' },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 10, 9, 0, 0)) // 2026-01-10
  mockPrisma.user.findMany.mockResolvedValue([
    { id: USER_ID, email: 'user@example.com', name: 'Giorgi', notificationPreferences: null },
  ])
  mockPrisma.notification.findFirst.mockResolvedValue(null)
  mockPrisma.notification.create.mockResolvedValue({ id: 'ntf-1' })
  mockSendReminder.mockResolvedValue({ success: true })
  mockSendPush.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('notifyDebtPaidOff', () => {
  it('creates a success milestone notification and pushes it', async () => {
    const result = await notifyDebtPaidOff(USER_ID, 'Consumer loan')

    expect(result.success).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'success',
        actionUrl: '/debts',
        message: expect.stringContaining('Consumer loan'),
      }),
    })
    expect(mockSendPush).toHaveBeenCalled()
  })
})

describe('sendUpcomingDebtNotifications', () => {
  it('sends an upcoming reminder (in-app payment type + email) within the window', async () => {
    // due 2026-01-12, now 2026-01-10, default window 3 days
    mockPrisma.debtScheduleItem.findMany.mockResolvedValue([makeItem()])

    const result = await sendUpcomingDebtNotifications()

    expect(result.success).toBe(true)
    expect(result.sentCount).toBe(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        type: 'payment',
        actionUrl: '/debts/debt-1',
      }),
    })
    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseTitle: 'Consumer loan',
        amount: 249.62,
        currency: 'GEL',
      })
    )
  })

  it('marks an overdue installment as an error notification', async () => {
    mockPrisma.debtScheduleItem.findMany.mockResolvedValue([
      makeItem({ id: 'item-2', dueDate: new Date(2026, 0, 5) }), // 5 days overdue
    ])

    await sendUpcomingDebtNotifications()

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'error' }),
    })
  })

  it('dedups: skips an installment already notified for the same event', async () => {
    mockPrisma.debtScheduleItem.findMany.mockResolvedValue([makeItem()])
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing' })

    const result = await sendUpcomingDebtNotifications()

    expect(result.sentCount).toBe(0)
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockSendReminder).not.toHaveBeenCalled()
  })

  it('honours a custom notifyBeforeDays window', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: USER_ID,
        email: 'user@example.com',
        name: null,
        notificationPreferences: { notifyBeforeDays: 7 },
      },
    ])
    mockPrisma.debtScheduleItem.findMany.mockResolvedValue([makeItem()])

    await sendUpcomingDebtNotifications()

    // the query window end should reflect the 7-day preference
    const whereArg = mockPrisma.debtScheduleItem.findMany.mock.calls[0][0].where
    expect(whereArg.debt).toEqual({ userId: USER_ID, status: 'ACTIVE' })
    expect(whereArg.paid).toBe(false)
    expect(whereArg.dueDate.lte.getDate()).toBe(17) // 2026-01-10 + 7
  })
})
