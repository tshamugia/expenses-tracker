import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockSvc } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: {
    paymentCard: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  mockSvc: {
    listPaymentCardsForUser: vi.fn(),
    createPaymentCardForUser: vi.fn(),
    updatePaymentCardForUser: vi.fn(),
    deletePaymentCardForUser: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/payment-card-service', () => mockSvc)

import {
  createPaymentCard,
  deletePaymentCard,
  getPaymentCardById,
  getUserPaymentCards,
  getUserPaymentCardsWithStats,
  updatePaymentCard,
} from './payment-card-actions'

const ME = 'user-me'
const OTHER = 'user-other'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: ME } })
})

describe('reads always use the session user, never the argument', () => {
  it('getUserPaymentCards ignores a foreign userId argument', async () => {
    mockPrisma.paymentCard.findMany.mockResolvedValue([])
    await getUserPaymentCards(OTHER)
    expect(mockPrisma.paymentCard.findMany.mock.calls[0][0].where).toEqual({ userId: ME })
  })

  it('getUserPaymentCardsWithStats ignores a foreign userId argument', async () => {
    mockSvc.listPaymentCardsForUser.mockResolvedValue([])
    await getUserPaymentCardsWithStats(OTHER)
    expect(mockSvc.listPaymentCardsForUser).toHaveBeenCalledWith(ME)
  })

  it('getPaymentCardById scopes the lookup to the session user', async () => {
    mockPrisma.paymentCard.findFirst.mockResolvedValue(null)
    expect(await getPaymentCardById('card-1')).toBeNull()
    expect(mockPrisma.paymentCard.findFirst).toHaveBeenCalledWith({ where: { id: 'card-1', userId: ME } })
  })

  it('reads return empty results when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await getUserPaymentCards(ME)).toEqual([])
    expect(await getUserPaymentCardsWithStats(ME)).toEqual([])
    expect(await getPaymentCardById('card-1')).toBeNull()
    expect(mockPrisma.paymentCard.findMany).not.toHaveBeenCalled()
    expect(mockSvc.listPaymentCardsForUser).not.toHaveBeenCalled()
  })
})

describe('writes', () => {
  const input = { userId: OTHER, cardholderName: 'Tengo S', cardNumber: '4242424242424242', expiryMonth: 12, expiryYear: 2030 }

  it('reject unauthenticated callers before touching the service', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await createPaymentCard(input)).toEqual({ success: false, error: 'Unauthorized' })
    expect(await updatePaymentCard('card-1', { nickname: 'x' })).toEqual({ success: false, error: 'Unauthorized' })
    expect(await deletePaymentCard('card-1')).toEqual({ success: false, error: 'Unauthorized' })
    for (const fn of Object.values(mockSvc)) expect(fn).not.toHaveBeenCalled()
  })

  it('createPaymentCard ignores input.userId and creates for the session user', async () => {
    mockSvc.createPaymentCardForUser.mockResolvedValue({ ok: true, data: { id: 'card-1' } })
    const r = await createPaymentCard(input)
    expect(mockSvc.createPaymentCardForUser).toHaveBeenCalledWith(ME, {
      cardholderName: 'Tengo S',
      cardNumber: '4242424242424242',
      expiryMonth: 12,
      expiryYear: 2030,
    })
    expect(r).toEqual({ success: true, data: { id: 'card-1' } })
  })

  it('updatePaymentCard / deletePaymentCard pass the session user for the ownership check and map errors', async () => {
    mockSvc.updatePaymentCardForUser.mockResolvedValue({ ok: false, error: 'Payment card not found or access denied' })
    expect(await updatePaymentCard('card-1', { nickname: 'Main' })).toEqual({
      success: false,
      error: 'Payment card not found or access denied',
    })
    expect(mockSvc.updatePaymentCardForUser).toHaveBeenCalledWith(ME, 'card-1', { nickname: 'Main' })

    mockSvc.deletePaymentCardForUser.mockResolvedValue({ ok: true, data: undefined })
    expect(await deletePaymentCard('card-1')).toEqual({ success: true, data: undefined })
    expect(mockSvc.deletePaymentCardForUser).toHaveBeenCalledWith(ME, 'card-1')
  })
})
