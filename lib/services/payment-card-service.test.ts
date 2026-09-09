import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    paymentCard: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))

import {
  createPaymentCardForUser,
  deletePaymentCardForUser,
  listPaymentCardsForUser,
  updatePaymentCardForUser,
} from './payment-card-service'

const USER = 'user-1'
const VISA = '4242424242424242'
const FUTURE_YEAR = new Date().getFullYear() + 3

const card = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1',
  userId: USER,
  cardholderName: 'Tengo S',
  lastFourDigits: '4242',
  expiryMonth: 12,
  expiryYear: FUTURE_YEAR,
  cardBrand: 'Visa',
  nickname: null,
  color: '#1e40af',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listPaymentCardsForUser', () => {
  it('scopes to the user and exposes only the last four digits plus the bill count', async () => {
    mockPrisma.paymentCard.findMany.mockResolvedValue([{ ...card(), _count: { expenses: 3 } }])
    const rows = await listPaymentCardsForUser(USER)
    expect(mockPrisma.paymentCard.findMany.mock.calls[0][0].where).toEqual({ userId: USER })
    expect(rows).toEqual([
      expect.objectContaining({ id: 'card-1', lastFourDigits: '4242', cardBrand: 'Visa', expenseCount: 3 }),
    ])
    expect(rows[0]).not.toHaveProperty('userId')
  })
})

describe('createPaymentCardForUser', () => {
  it('rejects an invalid number, an expired date, a short name and a bad colour', async () => {
    expect((await createPaymentCardForUser(USER, { cardholderName: 'Tengo S', cardNumber: '1234567890123456', expiryMonth: 12, expiryYear: FUTURE_YEAR })).ok).toBe(false)
    expect(await createPaymentCardForUser(USER, { cardholderName: 'Tengo S', cardNumber: VISA, expiryMonth: 1, expiryYear: 2000 })).toEqual({
      ok: false,
      error: 'Invalid or expired date',
    })
    expect(await createPaymentCardForUser(USER, { cardholderName: 'T', cardNumber: VISA, expiryMonth: 12, expiryYear: FUTURE_YEAR })).toEqual({
      ok: false,
      error: 'Cardholder name must be 2-50 characters',
    })
    expect((await createPaymentCardForUser(USER, { cardholderName: 'Tengo S', cardNumber: VISA, expiryMonth: 12, expiryYear: FUTURE_YEAR, color: 'blue' })).ok).toBe(false)
    expect(mockPrisma.paymentCard.create).not.toHaveBeenCalled()
  })

  it('stores only the last four digits and the detected brand', async () => {
    mockPrisma.paymentCard.create.mockResolvedValue(card())
    const r = await createPaymentCardForUser(USER, { cardholderName: ' Tengo S ', cardNumber: '4242 4242 4242 4242', expiryMonth: 12, expiryYear: FUTURE_YEAR, nickname: 'Main' })
    const data = mockPrisma.paymentCard.create.mock.calls[0][0].data
    expect(data).toEqual(expect.objectContaining({ userId: USER, cardholderName: 'Tengo S', lastFourDigits: '4242', cardBrand: 'Visa', nickname: 'Main', color: '#1e40af' }))
    expect(JSON.stringify(data)).not.toContain('4242424242424242')
    expect(r.ok).toBe(true)
  })
})

describe('updatePaymentCardForUser', () => {
  it("rejects another user's card before validating", async () => {
    mockPrisma.paymentCard.findFirst.mockResolvedValue(null)
    expect(await updatePaymentCardForUser(USER, 'card-1', { nickname: 'x' })).toEqual({ ok: false, error: 'Payment card not found or access denied' })
    expect(mockPrisma.paymentCard.findFirst).toHaveBeenCalledWith({ where: { id: 'card-1', userId: USER } })
    expect(mockPrisma.paymentCard.update).not.toHaveBeenCalled()
  })

  it('validates a partial expiry change against the stored other half', async () => {
    mockPrisma.paymentCard.findFirst.mockResolvedValue(card({ expiryYear: 2001 }))
    expect(await updatePaymentCardForUser(USER, 'card-1', { expiryMonth: 6 })).toEqual({ ok: false, error: 'Invalid or expired date' })

    mockPrisma.paymentCard.findFirst.mockResolvedValue(card())
    mockPrisma.paymentCard.update.mockResolvedValue(card({ expiryMonth: 6 }))
    expect((await updatePaymentCardForUser(USER, 'card-1', { expiryMonth: 6 })).ok).toBe(true)
  })

  it('updates only the given fields', async () => {
    mockPrisma.paymentCard.findFirst.mockResolvedValue(card())
    mockPrisma.paymentCard.update.mockResolvedValue(card({ nickname: 'Travel' }))
    await updatePaymentCardForUser(USER, 'card-1', { nickname: 'Travel', cardholderName: ' Tengo S ' })
    expect(mockPrisma.paymentCard.update).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: { cardholderName: 'Tengo S', expiryMonth: undefined, expiryYear: undefined, nickname: 'Travel', color: undefined },
    })
  })
})

describe('deletePaymentCardForUser', () => {
  it('deletes only an owned card', async () => {
    mockPrisma.paymentCard.findFirst.mockResolvedValue(null)
    expect((await deletePaymentCardForUser(USER, 'card-1')).ok).toBe(false)
    expect(mockPrisma.paymentCard.delete).not.toHaveBeenCalled()

    mockPrisma.paymentCard.findFirst.mockResolvedValue(card())
    expect(await deletePaymentCardForUser(USER, 'card-1')).toEqual({ ok: true, data: undefined })
    expect(mockPrisma.paymentCard.delete).toHaveBeenCalledWith({ where: { id: 'card-1' } })
  })
})
