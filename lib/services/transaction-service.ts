/**
 * Ledger transactions — userId-first update/delete (no session, no
 * revalidation). Shared by the transaction Server Actions and the MCP tools.
 * Quick-add lives in lib/services/quick-add.ts, income facts in income-service.
 */

import prisma from '@/lib/db/prisma'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import { SUPPORTED_CURRENCIES } from '@/lib/services/quick-add'
import type { SerializedTransaction, UpdateTransactionInput } from '@/types/transaction-types'

export function serializeTransaction(transaction: {
  amount: unknown
  [key: string]: unknown
}): SerializedTransaction {
  return {
    ...transaction,
    amount: Number(transaction.amount),
  } as SerializedTransaction
}

/** Update a transaction (amount, currency, date, category, description). */
export async function updateTransactionForUser(
  userId: string,
  id: string,
  input: UpdateTransactionInput
): Promise<Outcome<SerializedTransaction>> {
  // SECURITY: verify ownership
  const existing = await prisma.transaction.findFirst({ where: { id, userId } })
  if (!existing) return fail('Transaction not found or access denied')

  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    return fail('Amount must be greater than zero')
  }
  if (
    input.currency !== undefined &&
    !(SUPPORTED_CURRENCIES as readonly string[]).includes(input.currency)
  ) {
    return fail('Unsupported currency')
  }
  if (input.date !== undefined && isNaN(input.date.getTime())) {
    return fail('Invalid date')
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId },
    })
    if (!category) return fail('Category not found or access denied')
  }

  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      categoryId: input.categoryId,
      description: input.description,
    },
  })

  return ok(serializeTransaction(transaction))
}

/** Delete a transaction. */
export async function deleteTransactionForUser(userId: string, id: string): Promise<Outcome<void>> {
  // SECURITY: verify ownership
  const existing = await prisma.transaction.findFirst({ where: { id, userId } })
  if (!existing) return fail('Transaction not found or access denied')

  await prisma.transaction.delete({ where: { id } })

  return ok(undefined)
}
