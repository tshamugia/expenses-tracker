/**
 * Payment cards — userId-first business logic (no session, no revalidation).
 * Used by the MCP tools; every operation verifies that the card belongs to the
 * user. Only the last four digits of a card number are ever stored.
 */

import prisma from '@/lib/db/prisma'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import {
  getLastFourDigits,
  validateCardNumber,
  validateExpiryDate,
} from '@/lib/utils/card-validation'
import type {
  CreatePaymentCardInput,
  PaymentCardListItem,
  SerializedPaymentCard,
  UpdatePaymentCardInput,
} from '@/types/payment-card-types'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function validateCardholderName(name: string): string | null {
  if (!name.trim()) return 'Cardholder name is required'
  if (name.length < 2 || name.length > 50) return 'Cardholder name must be 2-50 characters'
  return null
}

/** All cards of the user with the number of fixed bills linked to each. */
export async function listPaymentCardsForUser(userId: string): Promise<PaymentCardListItem[]> {
  const cards = await prisma.paymentCard.findMany({
    where: { userId },
    include: { _count: { select: { expenses: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return cards.map((card) => ({
    id: card.id,
    cardholderName: card.cardholderName,
    lastFourDigits: card.lastFourDigits,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    cardBrand: card.cardBrand,
    nickname: card.nickname,
    color: card.color,
    expenseCount: card._count.expenses,
  }))
}

/** Create a card: Luhn-validate the number, keep only its last four digits. */
export async function createPaymentCardForUser(
  userId: string,
  input: Omit<CreatePaymentCardInput, 'userId'>
): Promise<Outcome<SerializedPaymentCard>> {
  const validation = validateCardNumber(input.cardNumber)
  if (!validation.isValid) return fail(validation.error || 'Invalid card number')
  if (!validateExpiryDate(input.expiryMonth, input.expiryYear)) return fail('Invalid or expired date')
  const nameError = validateCardholderName(input.cardholderName)
  if (nameError) return fail(nameError)
  if (input.color !== undefined && !HEX_COLOR.test(input.color)) {
    return fail('Color must be a hex value like #1e40af')
  }

  const card = await prisma.paymentCard.create({
    data: {
      userId,
      cardholderName: input.cardholderName.trim(),
      lastFourDigits: getLastFourDigits(input.cardNumber),
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      cardBrand: validation.brand,
      nickname: input.nickname || null,
      color: input.color || '#1e40af',
    },
  })
  return ok(card)
}

/** Update a card's cardholder name, expiry, nickname and/or colour. */
export async function updatePaymentCardForUser(
  userId: string,
  id: string,
  input: UpdatePaymentCardInput
): Promise<Outcome<SerializedPaymentCard>> {
  // SECURITY: verify ownership
  const existing = await prisma.paymentCard.findFirst({ where: { id, userId } })
  if (!existing) return fail('Payment card not found or access denied')

  const expiryMonth = input.expiryMonth ?? existing.expiryMonth
  const expiryYear = input.expiryYear ?? existing.expiryYear
  if (
    (input.expiryMonth !== undefined || input.expiryYear !== undefined) &&
    !validateExpiryDate(expiryMonth, expiryYear)
  ) {
    return fail('Invalid or expired date')
  }
  if (input.cardholderName !== undefined) {
    const nameError = validateCardholderName(input.cardholderName)
    if (nameError) return fail(nameError)
  }
  if (input.color !== undefined && !HEX_COLOR.test(input.color)) {
    return fail('Color must be a hex value like #1e40af')
  }

  const card = await prisma.paymentCard.update({
    where: { id },
    data: {
      cardholderName: input.cardholderName?.trim(),
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      nickname: input.nickname,
      color: input.color,
    },
  })
  return ok(card)
}

/** Delete a card. Linked fixed bills keep existing (paymentCardId → null). */
export async function deletePaymentCardForUser(userId: string, id: string): Promise<Outcome<void>> {
  // SECURITY: verify ownership
  const existing = await prisma.paymentCard.findFirst({ where: { id, userId } })
  if (!existing) return fail('Payment card not found or access denied')

  await prisma.paymentCard.delete({ where: { id } })
  return ok(undefined)
}
