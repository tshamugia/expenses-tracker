'use server'

/**
 * Server Actions for Debts (Phase 2)
 * BUSINESS LOGIC LAYER
 * - Debt CRUD with full annuity-schedule generation (one $transaction)
 * - Recording installments into the unified Transaction ledger
 * - Prepayment (extra-monthly / lump-sum) simulation + regeneration
 * - Debts overview with avalanche/snowball ranking for extra payments
 *
 * The pure math lives in lib/services/amortization.ts; these actions only
 * orchestrate (auth → fetch → engine → persist → revalidate).
 */

import { revalidatePath } from 'next/cache'
import { addMonths } from 'date-fns'
import type { DebtScheduleItem } from '@prisma/client'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import {
  buildSchedule,
  buildScheduleFromPayment,
  calcAnnuityPayment,
  roundMoney,
  simulateExtraMonthly,
  simulateLumpSum,
  rankDebtsForExtra,
  type PrepaymentSimResult,
  type ScheduleRow,
} from '@/lib/services/amortization'
import { notifyDebtPaidOff } from '@/lib/services/notification-service'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type {
  CreateDebtInput,
  DebtDetail,
  DebtListItem,
  DebtProgress,
  DebtsOverview,
  PrepaymentSimulation,
  RecordDebtPaymentInput,
  SerializedDebt,
  SerializedScheduleItem,
  SimulatePrepaymentInput,
  UpdateDebtInput,
} from '@/types/debt-types'

export interface DebtActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

const SUPPORTED_CURRENCIES = ['GEL', 'USD', 'EUR']
const MAX_TERM_MONTHS = 1200

// --- serialization helpers ---------------------------------------------------

function serializeDebt(debt: {
  principal: unknown
  annualRatePct: unknown
  monthlyPayment: unknown
  [key: string]: unknown
}): SerializedDebt {
  return {
    ...debt,
    principal: Number(debt.principal),
    annualRatePct: Number(debt.annualRatePct),
    monthlyPayment: Number(debt.monthlyPayment),
  } as SerializedDebt
}

function serializeItem(item: DebtScheduleItem): SerializedScheduleItem {
  return {
    ...item,
    payment: Number(item.payment),
    interestPart: Number(item.interestPart),
    principalPart: Number(item.principalPart),
    remainingPrincipal: Number(item.remainingPrincipal),
    paidAmount: item.paidAmount === null ? null : Number(item.paidAmount),
  }
}

/**
 * Progress snapshot from a (serialized) schedule — all in the debt's currency.
 */
function computeDebtProgress(
  schedule: SerializedScheduleItem[],
  now: Date = new Date()
): DebtProgress {
  const sorted = [...schedule].sort((a, b) => a.seq - b.seq)
  const paid = sorted.filter((s) => s.paid)
  const unpaid = sorted.filter((s) => !s.paid)

  const paidPrincipal = roundMoney(paid.reduce((s, i) => s + i.principalPart, 0))
  const remainingPrincipal = roundMoney(
    unpaid.reduce((s, i) => s + i.principalPart, 0)
  )
  const originalPrincipal = roundMoney(paidPrincipal + remainingPrincipal)
  const paidInterest = roundMoney(paid.reduce((s, i) => s + i.interestPart, 0))
  const remainingInterest = roundMoney(
    unpaid.reduce((s, i) => s + i.interestPart, 0)
  )
  const totalInterest = roundMoney(paidInterest + remainingInterest)
  const totalToPay = roundMoney(sorted.reduce((s, i) => s + i.payment, 0))

  const next = unpaid[0] ?? null
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  return {
    originalPrincipal,
    paidPrincipal,
    remainingPrincipal,
    paidInterest,
    remainingInterest,
    totalInterest,
    totalToPay,
    progressRatio: originalPrincipal > 0 ? paidPrincipal / originalPrincipal : 0,
    paidCount: paid.length,
    totalCount: sorted.length,
    nextDueDate: next ? new Date(next.dueDate) : null,
    nextPaymentAmount: next ? next.payment : null,
    endDate: sorted.length ? new Date(sorted[sorted.length - 1].dueDate) : null,
    isOverdue: !!next && new Date(next.dueDate) < startOfToday,
  }
}

function validateDebtBaseInput(input: CreateDebtInput): string | null {
  if (!input.name?.trim()) return 'Debt name is required'
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    return 'Principal must be greater than zero'
  }
  if (!Number.isFinite(input.annualRatePct) || input.annualRatePct < 0) {
    return 'Annual rate must be zero or greater'
  }
  const currency = input.currency || 'GEL'
  if (!SUPPORTED_CURRENCIES.includes(currency)) return 'Unsupported currency'
  if (!(input.firstPaymentDate instanceof Date) || isNaN(input.firstPaymentDate.getTime())) {
    return 'First payment date is required'
  }
  const hasTerm = input.termMonths !== undefined && input.termMonths !== null
  const hasPayment =
    input.monthlyPayment !== undefined && input.monthlyPayment !== null
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
export async function createDebt(
  input: CreateDebtInput
): Promise<DebtActionResult<SerializedDebt>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const validationError = validateDebtBaseInput(input)
    if (validationError) {
      return { success: false, error: validationError }
    }

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
      // Throws (→ caught below) when the payment never amortizes the balance
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

    revalidatePath('/debts')
    revalidatePath('/dashboard')

    return { success: true, data: serializeDebt(debt) }
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
    const userId = session.user.id

    const existing = await prisma.debt.findFirst({
      where: { id, userId },
      include: { schedule: { orderBy: { seq: 'asc' } } },
    })
    if (!existing) {
      return { success: false, error: 'Debt not found or access denied' }
    }

    if (input.name !== undefined && !input.name.trim()) {
      return { success: false, error: 'Debt name is required' }
    }

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

    revalidatePath('/debts')
    revalidatePath(`/debts/${id}`)

    return { success: true, data: serializeDebt(debt) }
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
    const userId = session.user.id

    const existing = await prisma.debt.findFirst({ where: { id, userId } })
    if (!existing) {
      return { success: false, error: 'Debt not found or access denied' }
    }

    await prisma.debt.update({ where: { id }, data: { status: 'ARCHIVED' } })

    revalidatePath('/debts')
    revalidatePath(`/debts/${id}`)

    return { success: true }
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
    const userId = session.user.id
    const now = new Date()

    const [debts, context] = await Promise.all([
      prisma.debt.findMany({
        where: { userId, status: { not: 'ARCHIVED' } },
        include: { schedule: { orderBy: { seq: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      getCurrencyContext(userId),
    ])

    const toDefault = (amount: number, currency: string) =>
      convertCurrency(
        amount,
        currency as Currency,
        context.defaultCurrency,
        context.usdRate,
        context.eurRate
      )

    const items: DebtListItem[] = debts.map((debt) => ({
      debt: serializeDebt(debt),
      progress: computeDebtProgress(debt.schedule.map(serializeItem), now),
    }))

    const activeItems = items.filter((i) => i.debt.status === 'ACTIVE')

    const totalRemainingPrincipal = roundMoney(
      activeItems.reduce(
        (sum, i) =>
          sum + toDefault(i.progress.remainingPrincipal, i.debt.currency),
        0
      )
    )
    const totalMonthlyPayment = roundMoney(
      activeItems.reduce(
        (sum, i) => sum + toDefault(i.debt.monthlyPayment, i.debt.currency),
        0
      )
    )

    // Earliest upcoming installment across active debts
    let nextPayment: DebtsOverview['nextPayment'] = null
    for (const item of activeItems) {
      const due = item.progress.nextDueDate
      if (!due || item.progress.nextPaymentAmount === null) continue
      if (!nextPayment || due < nextPayment.dueDate) {
        nextPayment = {
          debtId: item.debt.id,
          debtName: item.debt.name,
          dueDate: due,
          amount: item.progress.nextPaymentAmount,
          currency: item.debt.currency,
        }
      }
    }

    // Extra-payment strategy — only meaningful with ≥2 active debts
    let strategy: DebtsOverview['strategy'] = null
    const rankable = activeItems.filter((i) => i.progress.remainingPrincipal > 0)
    if (rankable.length >= 2) {
      const ranked = rankable.map((i) => ({
        id: i.debt.id,
        annualRatePct: i.debt.annualRatePct,
        remainingPrincipal: toDefault(
          i.progress.remainingPrincipal,
          i.debt.currency
        ),
      }))
      strategy = {
        avalancheFirstDebtId: rankDebtsForExtra(ranked, 'avalanche')[0].id,
        snowballFirstDebtId: rankDebtsForExtra(ranked, 'snowball')[0].id,
      }
    }

    return {
      success: true,
      data: {
        debts: items,
        defaultCurrency: context.defaultCurrency,
        totalRemainingPrincipal,
        totalMonthlyPayment,
        nextPayment,
        strategy,
      },
    }
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
    const userId = session.user.id

    const debt = await prisma.debt.findFirst({
      where: { id, userId },
      include: { schedule: { orderBy: { seq: 'asc' } } },
    })
    if (!debt) {
      return { success: false, error: 'Debt not found or access denied' }
    }

    const schedule = debt.schedule.map(serializeItem)
    const progress = computeDebtProgress(schedule)
    const currentSeq = schedule.find((s) => !s.paid)?.seq ?? null

    return {
      success: true,
      data: { debt: serializeDebt(debt), schedule, progress, currentSeq },
    }
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
    const userId = session.user.id

    const item = await prisma.debtScheduleItem.findFirst({
      where: { id: scheduleItemId, debt: { userId } },
      include: { debt: true },
    })
    if (!item) {
      return { success: false, error: 'Installment not found or access denied' }
    }
    if (item.paid) {
      return { success: false, error: 'Installment is already paid' }
    }

    const amount = input.amount ?? Number(item.payment)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' }
    }
    const paidAt = input.paidAt ?? new Date()

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
        data: {
          paid: true,
          paidAt,
          paidAmount: amount,
          transactionId: transaction.id,
        },
      })

      const remaining = await tx.debtScheduleItem.count({
        where: { debtId: item.debtId, paid: false },
      })

      if (remaining === 0) {
        await tx.debt.update({
          where: { id: item.debtId },
          data: { status: 'PAID_OFF' },
        })
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

    revalidatePath('/debts')
    revalidatePath(`/debts/${item.debtId}`)
    revalidatePath('/dashboard')
    revalidatePath('/expenses')

    return { success: true, data: { paidOff } }
  } catch (error) {
    console.error('Error in recordDebtPayment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment',
    }
  }
}

/**
 * Load a debt's unpaid schedule tail as engine rows, plus the current seq.
 * Shared by the simulate (read-only) and apply (mutating) prepayment actions.
 */
async function loadScheduleForSim(
  userId: string,
  debtId: string
): Promise<
  | { error: string }
  | {
      debt: Awaited<ReturnType<typeof prisma.debt.findFirst>> & object
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
  if (debt.status !== 'ACTIVE') {
    return { error: 'Only active debts can be prepaid' }
  }

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

/**
 * Read-only prepayment simulation — answers "N months earlier, Z saved".
 * (Phase 5 exposes this same action as an MCP tool.)
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
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' }
    }

    const loaded = await loadScheduleForSim(session.user.id, debtId)
    if ('error' in loaded) return { success: false, error: loaded.error }

    const rate = Number(loaded.debt.annualRatePct)
    const currentEndDate = loaded.rows[loaded.rows.length - 1]?.dueDate ?? null
    const sim = runSim(loaded.rows, loaded.currentSeq, input, rate)

    return {
      success: true,
      data: {
        monthsSaved: sim.monthsSaved,
        interestSaved: sim.interestSaved,
        newEndDate: sim.newEndDate,
        currentEndDate,
        currency: loaded.debt.currency,
      },
    }
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
    const userId = session.user.id

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' }
    }

    const loaded = await loadScheduleForSim(userId, debtId)
    if ('error' in loaded) return { success: false, error: loaded.error }

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
      await tx.debtScheduleItem.deleteMany({
        where: { debtId, paid: false },
      })

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
            date: new Date(),
            description: `${debt.name} — prepayment`,
            entrySource: 'MANUAL',
          },
        })
      }

      await tx.debt.update({
        where: { id: debtId },
        data: {
          monthlyPayment: newMonthlyPayment,
          termMonths: paidCount + newTail.length,
        },
      })
    })

    revalidatePath('/debts')
    revalidatePath(`/debts/${debtId}`)
    revalidatePath('/dashboard')
    if (input.type === 'lump_sum') revalidatePath('/expenses')

    return {
      success: true,
      data: {
        monthsSaved: sim.monthsSaved,
        interestSaved: sim.interestSaved,
        newEndDate: sim.newEndDate,
        currentEndDate,
        currency: debt.currency,
      },
    }
  } catch (error) {
    console.error('Error in applyPrepayment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply prepayment',
    }
  }
}
