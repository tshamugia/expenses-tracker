'use server'

/**
 * Server Actions for Payment Cards
 * BUSINESS LOGIC LAYER — orchestration only (auth → service → revalidate).
 * The user is ALWAYS resolved from the session, never from the arguments:
 * Server Actions are callable from any client, so a caller-supplied userId
 * or an unchecked card id would let one user read or edit another's cards.
 * The userId-first logic lives in lib/services/payment-card-service.ts and
 * is shared with the MCP tools.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { toActionResult } from '@/lib/services/outcome'
import {
  createPaymentCardForUser,
  deletePaymentCardForUser,
  listPaymentCardsForUser,
  updatePaymentCardForUser,
} from '@/lib/services/payment-card-service'
import type {
  SerializedPaymentCard,
  CreatePaymentCardInput,
  UpdatePaymentCardInput,
  ActionResult,
  PaymentCardListItem,
} from '@/types/payment-card-types'

async function sessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

function revalidateCardPages(): void {
  revalidatePath('/payments')
  revalidatePath('/expenses')
  revalidatePath('/dashboard')
}

/**
 * Get all payment cards of the signed-in user. The `_userId` argument is kept
 * for call-site compatibility but is ignored — the session decides.
 */
export async function getUserPaymentCards(
  _userId?: string
): Promise<SerializedPaymentCard[]> {
  void _userId
  try {
    const userId = await sessionUserId()
    if (!userId) return []
    return await prisma.paymentCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  } catch (error) {
    console.error('Error fetching payment cards:', error)
    return []
  }
}

/**
 * Get all payment cards with expense count for the signed-in user.
 * The `_userId` argument is ignored — the session decides.
 */
export async function getUserPaymentCardsWithStats(
  _userId?: string
): Promise<PaymentCardListItem[]> {
  void _userId
  try {
    const userId = await sessionUserId()
    if (!userId) return []
    return await listPaymentCardsForUser(userId)
  } catch (error) {
    console.error('Error fetching payment cards with stats:', error)
    return []
  }
}

/**
 * Get a single payment card by ID — only if it belongs to the signed-in user.
 */
export async function getPaymentCardById(
  id: string
): Promise<SerializedPaymentCard | null> {
  try {
    const userId = await sessionUserId()
    if (!userId) return null
    return await prisma.paymentCard.findFirst({ where: { id, userId } })
  } catch (error) {
    console.error('Error fetching payment card:', error)
    return null
  }
}

/**
 * Create a new payment card for the signed-in user. `input.userId` is ignored.
 */
export async function createPaymentCard(
  input: CreatePaymentCardInput
): Promise<ActionResult<SerializedPaymentCard>> {
  try {
    const userId = await sessionUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const { userId: _ignored, ...rest } = input
    void _ignored
    const outcome = await createPaymentCardForUser(userId, rest)
    if (outcome.ok) revalidateCardPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error creating payment card:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment card',
    }
  }
}

/**
 * Update a payment card — only if it belongs to the signed-in user.
 */
export async function updatePaymentCard(
  id: string,
  input: UpdatePaymentCardInput
): Promise<ActionResult<SerializedPaymentCard>> {
  try {
    const userId = await sessionUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const outcome = await updatePaymentCardForUser(userId, id, input)
    if (outcome.ok) revalidateCardPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error updating payment card:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment card',
    }
  }
}

/**
 * Delete a payment card — only if it belongs to the signed-in user.
 * Related expenses keep existing (paymentCardId → null).
 */
export async function deletePaymentCard(
  id: string
): Promise<ActionResult<void>> {
  try {
    const userId = await sessionUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const outcome = await deletePaymentCardForUser(userId, id)
    if (outcome.ok) revalidateCardPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error deleting payment card:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete payment card',
    }
  }
}
