'use server'

/**
 * Server Actions for Debts (Phase 2)
 * BUSINESS LOGIC LAYER — orchestration only (auth → service → revalidate).
 * The userId-first logic lives in lib/services/debt-service.ts and is shared
 * with the MCP tools; the pure math in lib/services/amortization.ts.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { buildDebtsOverview } from '@/lib/services/debt-overview'
import {
  applyPrepaymentForUser,
  archiveDebtForUser,
  createDebtForUser,
  getDebtDetailForUser,
  recordDebtPaymentForUser,
  simulatePrepaymentForUser,
  updateDebtForUser,
} from '@/lib/services/debt-service'
import { toActionResult } from '@/lib/services/outcome'
import type {
  CreateDebtInput,
  DebtDetail,
  DebtsOverview,
  PrepaymentSimulation,
  RecordDebtPaymentInput,
  SerializedDebt,
  SimulatePrepaymentInput,
  UpdateDebtInput,
} from '@/types/debt-types'

export interface DebtActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

function revalidateDebtPages(debtId?: string, extra: string[] = []): void {
  revalidatePath('/debts')
  if (debtId) revalidatePath(`/debts/${debtId}`)
  revalidatePath('/plan')
  revalidatePath('/dashboard')
  for (const path of extra) revalidatePath(path)
}

// --- CRUD --------------------------------------------------------------------

/**
 * Create a debt: derive the missing field (term ↔ payment), generate the full
 * amortization schedule and persist Debt + schedule atomically.
 */
export async function createDebt(
  input: CreateDebtInput
): Promise<DebtActionResult<SerializedDebt>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await createDebtForUser(session.user.id, input)
    if (outcome.ok) revalidateDebtPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in createDebt:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create debt',
    }
  }
}

/**
 * Update a debt's name and/or first-payment date. Changing the date reflows the
 * due dates of unpaid installments (paid history is left untouched).
 */
export async function updateDebt(
  id: string,
  input: UpdateDebtInput
): Promise<DebtActionResult<SerializedDebt>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await updateDebtForUser(session.user.id, id, input)
    if (outcome.ok) revalidateDebtPages(id)
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in updateDebt:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update debt',
    }
  }
}

/**
 * Archive a debt (soft delete — ledger history stays intact).
 */
export async function archiveDebt(id: string): Promise<DebtActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await archiveDebtForUser(session.user.id, id)
    if (outcome.ok) revalidateDebtPages(id)
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in archiveDebt:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive debt',
    }
  }
}

// --- queries -----------------------------------------------------------------

/**
 * Debts overview: non-archived debts with per-debt progress, plus aggregates
 * (total remaining principal, total monthly payment, next payment) and the
 * avalanche/snowball ranking for an extra payment (only with ≥2 active debts).
 */
export async function getDebts(): Promise<DebtActionResult<DebtsOverview>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const data = await buildDebtsOverview(session.user.id, new Date())
    return { success: true, data }
  } catch (error) {
    console.error('Error in getDebts:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load debts',
    }
  }
}

/**
 * Full detail for one debt: schedule + progress + the current (next unpaid) seq.
 */
export async function getDebtDetail(
  id: string
): Promise<DebtActionResult<DebtDetail>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    return toActionResult(await getDebtDetailForUser(session.user.id, id))
  } catch (error) {
    console.error('Error in getDebtDetail:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load debt',
    }
  }
}

// --- payments & prepayment ---------------------------------------------------

/**
 * Record an installment: mark the schedule row paid and mirror it into the
 * ledger as an EXPENSE — atomically. Closing the final row flips the debt to
 * PAID_OFF and fires the milestone notification.
 */
export async function recordDebtPayment(
  scheduleItemId: string,
  input: RecordDebtPaymentInput = {}
): Promise<DebtActionResult<{ paidOff: boolean }>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await recordDebtPaymentForUser(session.user.id, scheduleItemId, input)
    if (!outcome.ok) return { success: false, error: outcome.error }

    revalidatePath('/debts')
    revalidatePath(`/debts/${outcome.data.debtId}`)
    revalidatePath('/dashboard')
    revalidatePath('/expenses')

    return { success: true, data: { paidOff: outcome.data.paidOff } }
  } catch (error) {
    console.error('Error in recordDebtPayment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment',
    }
  }
}

/**
 * Read-only prepayment simulation — answers "N months earlier, Z saved".
 * (Also exposed as the MCP `simulate_prepayment` tool.)
 */
export async function simulatePrepayment(
  debtId: string,
  input: SimulatePrepaymentInput
): Promise<DebtActionResult<PrepaymentSimulation>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    return toActionResult(await simulatePrepaymentForUser(session.user.id, debtId, input))
  } catch (error) {
    console.error('Error in simulatePrepayment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to simulate prepayment',
    }
  }
}

/**
 * Apply a prepayment: regenerate the unpaid schedule tail from the simulation
 * (paid rows untouched). A lump sum also books an EXPENSE in the ledger.
 */
export async function applyPrepayment(
  debtId: string,
  input: SimulatePrepaymentInput
): Promise<DebtActionResult<PrepaymentSimulation>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await applyPrepaymentForUser(session.user.id, debtId, input)
    if (outcome.ok) {
      revalidateDebtPages(debtId, input.type === 'lump_sum' ? ['/expenses'] : [])
    }
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in applyPrepayment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply prepayment',
    }
  }
}
