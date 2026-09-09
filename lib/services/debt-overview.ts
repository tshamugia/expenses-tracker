/**
 * Debt serialization + overview builders (Phase 2).
 * DATA-ACCESS + ASSEMBLY LAYER — userId-first, no session, no revalidation.
 * Shared by lib/actions/debt-actions.ts and the MCP server so both surfaces
 * report identical numbers. The amortization math lives in amortization.ts.
 */

import type { DebtScheduleItem } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { rankDebtsForExtra, roundMoney } from '@/lib/services/amortization'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type {
  DebtListItem,
  DebtProgress,
  DebtsOverview,
  SerializedDebt,
  SerializedScheduleItem,
} from '@/types/debt-types'

// --- serialization helpers ---------------------------------------------------

export function serializeDebt(debt: {
  principal: unknown
  annualRatePct: unknown
  monthlyPayment: unknown
  [key: string]: unknown
}): SerializedDebt {
  // Drop the `schedule` relation if it was included — its rows carry raw
  // Decimal values that can't cross the Server→Client boundary. Callers that
  // need the schedule serialize it separately via serializeItem.
  const { schedule: _schedule, ...rest } = debt
  return {
    ...rest,
    principal: Number(debt.principal),
    annualRatePct: Number(debt.annualRatePct),
    monthlyPayment: Number(debt.monthlyPayment),
  } as SerializedDebt
}

export function serializeItem(item: DebtScheduleItem): SerializedScheduleItem {
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
export function computeDebtProgress(
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

// --- overview ----------------------------------------------------------------

/** Debts overview: list + progress, totals in the default currency, next installment, strategy. */
export async function buildDebtsOverview(userId: string, now: Date = new Date()): Promise<DebtsOverview> {
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
      debts: items,
      defaultCurrency: context.defaultCurrency,
      totalRemainingPrincipal,
      totalMonthlyPayment,
      nextPayment,
      strategy,
  }
}
