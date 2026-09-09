/**
 * Debts — userId-first business logic (no session, no revalidation). Shared by
 * the debt Server Actions and the MCP tools.
 *
 * - Debt CRUD with full annuity-schedule generation (one $transaction)
 * - Recording installments into the unified Transaction ledger
 * - Prepayment (extra-monthly / lump-sum) simulation + regeneration
 *
 * The pure math lives in lib/services/amortization.ts.
 */

import { addMonths } from 'date-fns'
import prisma from '@/lib/db/prisma'
import {
  buildSchedule,
  buildScheduleFromPayment,
  calcAnnuityPayment,
  roundMoney,
  simulateExtraMonthly,
  simulateLumpSum,
  type PrepaymentSimResult,
  type ScheduleRow,
} from '@/lib/services/amortization'
import { computeDebtProgress, serializeDebt, serializeItem } from '@/lib/services/debt-overview'
import { notifyDebtPaidOff } from '@/lib/services/notification-service'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import { regenerateCurrentPlan } from '@/lib/services/plan-generation'
import { SUPPORTED_CURRENCIES } from '@/lib/services/quick-add'
import type {
  CreateDebtInput,
  DebtDetail,
  PrepaymentSimulation,
  RecordDebtPaymentInput,
  SerializedDebt,
  SimulatePrepaymentInput,
  UpdateDebtInput,
} from '@/types/debt-types'

export const MAX_TERM_MONTHS = 1200

export function validateDebtBaseInput(input: CreateDebtInput): string | null {
  if (!input.name?.trim()) return 'Debt name is required'
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    return 'Principal must be greater than zero'
  }
  if (!Number.isFinite(input.annualRatePct) || input.annualRatePct < 0) {
    return 'Annual rate must be zero or greater'
  }
  const currency = input.currency || 'GEL'
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return 'Unsupported currency'
  }
  if (!(input.firstPaymentDate instanceof Date) || isNaN(input.firstPaymentDate.getTime())) {
    return 'First payment date is required'
  }
  const hasTerm = input.termMonths !== undefined && input.termMonths !== null
  const hasPayment = input.monthlyPayment !== undefined && input.monthlyPayment !== null
  if (hasTerm === hasPayment) {
    return 'Provide exactly one of term (months) or monthly payment'
  }
  if (hasTerm) {
    if (
      !Number.isInteger(input.termMonths) ||
      (input.termMonths as number) < 1 ||
      (input.termMonths as number) > MAX_TERM_MONTHS
    ) {
      return 'Term must be between 1 and 1200 months'
    }
  } else if (!Number.isFinite(input.monthlyPayment) || (input.monthlyPayment as number) <= 0) {
    return 'Monthly payment must be greater than zero'
  }
  return null
}

// --- CRUD --------------------------------------------------------------------

/**
 * Create a debt: derive the missing field (term ↔ payment), generate the full
 * amortization schedule and persist Debt + schedule atomically.
 */
export async function createDebtForUser(
  userId: string,
  input: CreateDebtInput
): Promise<Outcome<SerializedDebt>> {
  const validationError = validateDebtBaseInput(input)
  if (validationError) return fail(validationError)

  const currency = input.currency || 'GEL'
  const principal = input.principal
  const rate = input.annualRatePct

  let schedule: ScheduleRow[]
  let termMonths: number
  let monthlyPayment: number

  if (input.termMonths !== undefined && input.termMonths !== null) {
    termMonths = input.termMonths
    monthlyPayment = calcAnnuityPayment(principal, rate, termMonths)
    schedule = buildSchedule({
      principal,
      annualRatePct: rate,
      termMonths,
      firstPaymentDate: input.firstPaymentDate,
    })
  } else {
    monthlyPayment = input.monthlyPayment as number
    // Throws (→ caught by the caller) when the payment never amortizes the balance
    schedule = buildScheduleFromPayment({
      principal,
      annualRatePct: rate,
      monthlyPayment,
      firstPaymentDate: input.firstPaymentDate,
    })
    termMonths = schedule.length
  }

  const debt = await prisma.$transaction(async (tx) => {
    const created = await tx.debt.create({
      data: {
        userId,
        name: input.name.trim(),
        principal,
        annualRatePct: rate,
        termMonths,
        monthlyPayment,
        currency,
        firstPaymentDate: input.firstPaymentDate,
      },
    })

    await tx.debtScheduleItem.createMany({
      data: schedule.map((row) => ({
        debtId: created.id,
        seq: row.seq,
        dueDate: row.dueDate,
        payment: row.payment,
        interestPart: row.interestPart,
        principalPart: row.principalPart,
        remainingPrincipal: row.remainingPrincipal,
      })),
    })

    return created
  })

  // A new debt adds an installment to this month's obligations → re-derive the
  // plan and Safe-to-Spend (Phase 4b event-driven refresh).
  await regenerateCurrentPlan(userId)

  return ok(serializeDebt(debt))
}

/**
 * Update a debt's name and/or first-payment date. Changing the date reflows the
 * due dates of unpaid installments (paid history is left untouched).
 */
export async function updateDebtForUser(
  userId: string,
  id: string,
  input: UpdateDebtInput
): Promise<Outcome<SerializedDebt>> {
  const existing = await prisma.debt.findFirst({
    where: { id, userId },
    include: { schedule: { orderBy: { seq: 'asc' } } },
  })
  if (!existing) return fail('Debt not found or access denied')

  if (input.name !== undefined && !input.name.trim()) return fail('Debt name is required')

  const newFirstDate =
    input.firstPaymentDate instanceof Date && !isNaN(input.firstPaymentDate.getTime())
      ? input.firstPaymentDate
      : null

  const debt = await prisma.$transaction(async (tx) => {
    const updated = await tx.debt.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        firstPaymentDate: newFirstDate ?? undefined,
      },
    })

    // Reflow unpaid due dates from the new first-payment date
    if (newFirstDate) {
      for (const item of existing.schedule) {
        if (item.paid) continue
        await tx.debtScheduleItem.update({
          where: { id: item.id },
          data: { dueDate: addMonths(newFirstDate, item.seq - 1) },
        })
      }
    }

    return updated
  })

  // Reflowing unpaid due dates can move an installment into/out of this month
  // → re-derive the plan's debt obligations.
  await regenerateCurrentPlan(userId)

  return ok(serializeDebt(debt))
}

/** Archive a debt (soft delete — ledger history stays intact). */
export async function archiveDebtForUser(userId: string, id: string): Promise<Outcome<void>> {
  const existing = await prisma.debt.findFirst({ where: { id, userId } })
  if (!existing) return fail('Debt not found or access denied')

  await prisma.debt.update({ where: { id }, data: { status: 'ARCHIVED' } })

  // Removing a debt frees its installment from this month's obligations →
  // re-derive the plan.
  await regenerateCurrentPlan(userId)

  return ok(undefined)
}

// --- queries -----------------------------------------------------------------

/** Full detail for one debt: schedule + progress + the current (next unpaid) seq. */
export async function getDebtDetailForUser(
  userId: string,
  id: string
): Promise<Outcome<DebtDetail>> {
  const debt = await prisma.debt.findFirst({
    where: { id, userId },
    include: { schedule: { orderBy: { seq: 'asc' } } },
  })
  if (!debt) return fail('Debt not found or access denied')

  const schedule = debt.schedule.map(serializeItem)
  const progress = computeDebtProgress(schedule)
  const currentSeq = schedule.find((s) => !s.paid)?.seq ?? null

  return ok({ debt: serializeDebt(debt), schedule, progress, currentSeq })
}

// --- payments & prepayment ---------------------------------------------------

/**
 * Record an installment: mark the schedule row paid and mirror it into the
 * ledger as an EXPENSE — atomically. Closing the final row flips the debt to
 * PAID_OFF and fires the milestone notification.
 */
export async function recordDebtPaymentForUser(
  userId: string,
  scheduleItemId: string,
  input: RecordDebtPaymentInput = {},
  now: Date = new Date()
): Promise<Outcome<{ paidOff: boolean; debtId: string }>> {
  const item = await prisma.debtScheduleItem.findFirst({
    where: { id: scheduleItemId, debt: { userId } },
    include: { debt: true },
  })
  if (!item) return fail('Installment not found or access denied')
  if (item.paid) return fail('Installment is already paid')

  const amount = input.amount ?? Number(item.payment)
  if (!Number.isFinite(amount) || amount <= 0) return fail('Amount must be greater than zero')
  const paidAt = input.paidAt ?? now

  const { paidOff } = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'EXPENSE',
        amount,
        currency: item.debt.currency,
        date: paidAt,
        description: item.debt.name,
        entrySource: 'MANUAL',
      },
    })

    await tx.debtScheduleItem.update({
      where: { id: item.id },
      data: { paid: true, paidAt, paidAmount: amount, transactionId: transaction.id },
    })

    const remaining = await tx.debtScheduleItem.count({
      where: { debtId: item.debtId, paid: false },
    })

    if (remaining === 0) {
      await tx.debt.update({ where: { id: item.debtId }, data: { status: 'PAID_OFF' } })
      return { paidOff: true }
    }
    return { paidOff: false }
  })

  if (paidOff) {
    // Best-effort milestone — never blocks the payment write
    try {
      await notifyDebtPaidOff(userId, item.debt.name)
    } catch (error) {
      console.error('Error notifying debt paid off:', error)
    }
  }

  return ok({ paidOff, debtId: item.debtId })
}

/**
 * Load a debt's schedule as engine rows, plus the current seq.
 * Shared by the simulate (read-only) and apply (mutating) prepayment paths.
 */
async function loadScheduleForSim(
  userId: string,
  debtId: string
): Promise<
  | { error: string }
  | {
      debt: NonNullable<Awaited<ReturnType<typeof prisma.debt.findFirst>>>
      rows: ScheduleRow[]
      currentSeq: number
      paidCount: number
    }
> {
  const debt = await prisma.debt.findFirst({
    where: { id: debtId, userId },
    include: { schedule: { orderBy: { seq: 'asc' } } },
  })
  if (!debt) return { error: 'Debt not found or access denied' }
  if (debt.status !== 'ACTIVE') return { error: 'Only active debts can be prepaid' }

  const rows: ScheduleRow[] = debt.schedule.map((item) => ({
    seq: item.seq,
    dueDate: new Date(item.dueDate),
    payment: Number(item.payment),
    interestPart: Number(item.interestPart),
    principalPart: Number(item.principalPart),
    remainingPrincipal: Number(item.remainingPrincipal),
  }))

  const firstUnpaid = debt.schedule.find((s) => !s.paid)
  if (!firstUnpaid) return { error: 'This debt has no unpaid installments' }

  return {
    debt,
    rows,
    currentSeq: firstUnpaid.seq,
    paidCount: debt.schedule.filter((s) => s.paid).length,
  }
}

function runSim(
  rows: ScheduleRow[],
  currentSeq: number,
  input: SimulatePrepaymentInput,
  rate: number
): PrepaymentSimResult {
  return input.type === 'extra_monthly'
    ? simulateExtraMonthly(rows, currentSeq, input.amount, rate)
    : simulateLumpSum(rows, currentSeq, input.amount, rate)
}

/** Read-only prepayment simulation — answers "N months earlier, Z saved". */
export async function simulatePrepaymentForUser(
  userId: string,
  debtId: string,
  input: SimulatePrepaymentInput
): Promise<Outcome<PrepaymentSimulation>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail('Amount must be greater than zero')
  }

  const loaded = await loadScheduleForSim(userId, debtId)
  if ('error' in loaded) return fail(loaded.error)

  const rate = Number(loaded.debt.annualRatePct)
  const currentEndDate = loaded.rows[loaded.rows.length - 1]?.dueDate ?? null
  const sim = runSim(loaded.rows, loaded.currentSeq, input, rate)

  return ok({
    monthsSaved: sim.monthsSaved,
    interestSaved: sim.interestSaved,
    newEndDate: sim.newEndDate,
    currentEndDate,
    currency: loaded.debt.currency,
  })
}

/**
 * Apply a prepayment: regenerate the unpaid schedule tail from the simulation
 * (paid rows untouched). A lump sum also books an EXPENSE in the ledger.
 */
export async function applyPrepaymentForUser(
  userId: string,
  debtId: string,
  input: SimulatePrepaymentInput,
  now: Date = new Date()
): Promise<Outcome<PrepaymentSimulation>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail('Amount must be greater than zero')
  }

  const loaded = await loadScheduleForSim(userId, debtId)
  if ('error' in loaded) return fail(loaded.error)

  const { debt, currentSeq, paidCount } = loaded
  const rate = Number(debt.annualRatePct)
  const currentEndDate = loaded.rows[loaded.rows.length - 1]?.dueDate ?? null
  const sim = runSim(loaded.rows, currentSeq, input, rate)

  // The regenerated unpaid tail (seq ≥ currentSeq)
  const newTail = sim.newSchedule.filter((row) => row.seq >= currentSeq)
  const newMonthlyPayment =
    input.type === 'extra_monthly'
      ? roundMoney(Number(debt.monthlyPayment) + input.amount)
      : Number(debt.monthlyPayment)

  await prisma.$transaction(async (tx) => {
    await tx.debtScheduleItem.deleteMany({ where: { debtId, paid: false } })

    await tx.debtScheduleItem.createMany({
      data: newTail.map((row) => ({
        debtId,
        seq: row.seq,
        dueDate: row.dueDate,
        payment: row.payment,
        interestPart: row.interestPart,
        principalPart: row.principalPart,
        remainingPrincipal: row.remainingPrincipal,
      })),
    })

    if (input.type === 'lump_sum') {
      await tx.transaction.create({
        data: {
          userId,
          type: 'EXPENSE',
          amount: input.amount,
          currency: debt.currency,
          date: now,
          description: `${debt.name} — prepayment`,
          entrySource: 'MANUAL',
        },
      })
    }

    await tx.debt.update({
      where: { id: debtId },
      data: { monthlyPayment: newMonthlyPayment, termMonths: paidCount + newTail.length },
    })
  })

  // Prepayment changes the monthly payment / schedule tail → the plan's debt
  // obligation for this month may shift. Re-derive.
  await regenerateCurrentPlan(userId)

  return ok({
    monthsSaved: sim.monthsSaved,
    interestSaved: sim.interestSaved,
    newEndDate: sim.newEndDate,
    currentEndDate,
    currency: debt.currency,
  })
}
