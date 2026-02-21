'use server'

/**
 * Server Actions for Payment Cards
 * BUSINESS LOGIC LAYER
 * - Handle CRUD operations for payment cards
 * - Validate card data
 * - Transform data for UI consumption
 */

import { revalidatePath } from 'next/cache'
import { prisma } from '@extracker/db'
import {
  validateCardNumber,
  getLastFourDigits,
  validateExpiryDate,
} from '@extracker/core'
import type {
  ActionResult,
  SerializedPaymentCard,
  CreatePaymentCardInput,
  UpdatePaymentCardInput,
  PaymentCardListItem,
} from '@extracker/types'

/**
 * Get all payment cards for a user
 */
export async function getUserPaymentCards(
  userId: string
): Promise<SerializedPaymentCard[]> {
  try {
    const cards = await prisma.paymentCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return cards
  } catch (error) {
    console.error('Error fetching payment cards:', error)
    return []
  }
}

/**
 * Get all payment cards with expense count for a user
 */
export async function getUserPaymentCardsWithStats(
  userId: string
): Promise<PaymentCardListItem[]> {
  try {
    const cards = await prisma.paymentCard.findMany({
      where: { userId },
      include: {
        _count: {
          select: { expenses: true },
        },
      },
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
  } catch (error) {
    console.error('Error fetching payment cards with stats:', error)
    return []
  }
}

/**
 * Get a single payment card by ID
 */
export async function getPaymentCardById(
  id: string
): Promise<SerializedPaymentCard | null> {
  try {
    const card = await prisma.paymentCard.findUnique({
      where: { id },
    })

    return card
  } catch (error) {
    console.error('Error fetching payment card:', error)
    return null
  }
}

/**
 * Create a new payment card
 */
export async function createPaymentCard(
  input: CreatePaymentCardInput
): Promise<ActionResult<SerializedPaymentCard>> {
  try {
    // Validate card number
    const validation = validateCardNumber(input.cardNumber)
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error || 'Invalid card number',
      }
    }

    // Validate expiry date
    if (!validateExpiryDate(input.expiryMonth, input.expiryYear)) {
      return {
        success: false,
        error: 'Invalid or expired date',
      }
    }

    // Validate cardholder name
    if (!input.cardholderName.trim()) {
      return {
        success: false,
        error: 'Cardholder name is required',
      }
    }

    if (input.cardholderName.length < 2 || input.cardholderName.length > 50) {
      return {
        success: false,
        error: 'Cardholder name must be 2-50 characters',
      }
    }

    // Extract last 4 digits
    const lastFourDigits = getLastFourDigits(input.cardNumber)

    // Create payment card
    const card = await prisma.paymentCard.create({
      data: {
        userId: input.userId,
        cardholderName: input.cardholderName,
        lastFourDigits,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
        cardBrand: validation.brand,
        nickname: input.nickname || null,
        color: input.color || '#1e40af',
      },
    })

    // Revalidate pages
    revalidatePath('/payments')
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return { success: true, data: card }
  } catch (error) {
    console.error('Error creating payment card:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment card',
    }
  }
}

/**
 * Update an existing payment card
 */
export async function updatePaymentCard(
  id: string,
  input: UpdatePaymentCardInput
): Promise<ActionResult<SerializedPaymentCard>> {
  try {
    // Validate expiry date if provided
    if (input.expiryMonth !== undefined && input.expiryYear !== undefined) {
      if (!validateExpiryDate(input.expiryMonth, input.expiryYear)) {
        return {
          success: false,
          error: 'Invalid or expired date',
        }
      }
    }

    // Validate cardholder name if provided
    if (input.cardholderName !== undefined) {
      if (!input.cardholderName.trim()) {
        return {
          success: false,
          error: 'Cardholder name is required',
        }
      }

      if (input.cardholderName.length < 2 || input.cardholderName.length > 50) {
        return {
          success: false,
          error: 'Cardholder name must be 2-50 characters',
        }
      }
    }

    // Update payment card
    const card = await prisma.paymentCard.update({
      where: { id },
      data: {
        cardholderName: input.cardholderName,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
        nickname: input.nickname,
        color: input.color,
      },
    })

    // Revalidate pages
    revalidatePath('/payments')
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return { success: true, data: card }
  } catch (error) {
    console.error('Error updating payment card:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment card',
    }
  }
}

/**
 * Delete a payment card
 */
export async function deletePaymentCard(
  id: string
): Promise<ActionResult<void>> {
  try {
    // Delete payment card
    // Note: Related expenses will have paymentCardId set to null (onDelete: SetNull)
    await prisma.paymentCard.delete({
      where: { id },
    })

    // Revalidate pages
    revalidatePath('/payments')
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error deleting payment card:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete payment card',
    }
  }
}
