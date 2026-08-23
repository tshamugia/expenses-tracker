import type { Debt, DebtScheduleItem, DebtStatus } from '@prisma/client'

/**
 * Debt Types (Phase 2)
 * Type definitions for debts, amortization schedule items, progress summaries,
 * the debts overview, and the prepayment simulator.
 */

export type { DebtStatus }

// Serialized debt for client components (Decimal → number)
export type SerializedDebt = Omit<
  Debt,
  'principal' | 'annualRatePct' | 'monthlyPayment'
> & {
  principal: number
  annualRatePct: number
  monthlyPayment: number
}

// Serialized schedule row (Decimal → number)
export type SerializedScheduleItem = Omit<
  DebtScheduleItem,
  'payment' | 'interestPart' | 'principalPart' | 'remainingPrincipal' | 'paidAmount'
> & {
  payment: number
  interestPart: number
  principalPart: number
  remainingPrincipal: number
  paidAmount: number | null
}

export interface CreateDebtInput {
  name: string
  principal: number
  annualRatePct: number
  currency?: string
  firstPaymentDate: Date
  // exactly one of the two must be provided
  termMonths?: number
  monthlyPayment?: number
}

export interface UpdateDebtInput {
  name?: string
  firstPaymentDate?: Date
}

// Progress snapshot, all amounts in the debt's own currency
export interface DebtProgress {
  originalPrincipal: number
  paidPrincipal: number
  remainingPrincipal: number
  paidInterest: number
  remainingInterest: number
  totalInterest: number
  totalToPay: number
  progressRatio: number // paidPrincipal / originalPrincipal, 0..1
  paidCount: number
  totalCount: number
  nextDueDate: Date | null
  nextPaymentAmount: number | null
  endDate: Date | null
  isOverdue: boolean
}

export interface DebtListItem {
  debt: SerializedDebt
  progress: DebtProgress
}

export interface NextPaymentInfo {
  debtId: string
  debtName: string
  dueDate: Date
  amount: number
  currency: string
}

export interface DebtStrategy {
  avalancheFirstDebtId: string
  snowballFirstDebtId: string
}

// Everything the /debts list page needs in one payload
export interface DebtsOverview {
  debts: DebtListItem[]
  defaultCurrency: string
  totalRemainingPrincipal: number // in default currency
  totalMonthlyPayment: number // in default currency
  nextPayment: NextPaymentInfo | null
  strategy: DebtStrategy | null // only present with ≥2 active debts
}

// Everything the /debts/[id] detail page needs
export interface DebtDetail {
  debt: SerializedDebt
  schedule: SerializedScheduleItem[]
  progress: DebtProgress
  currentSeq: number | null // next unpaid installment
}

export interface RecordDebtPaymentInput {
  paidAt?: Date
  amount?: number // actual amount (differs from installment on prepayment)
}

export type PrepaymentType = 'extra_monthly' | 'lump_sum'

export interface SimulatePrepaymentInput {
  type: PrepaymentType
  amount: number
}

export interface PrepaymentSimulation {
  monthsSaved: number
  interestSaved: number
  newEndDate: Date
  currentEndDate: Date | null
  currency: string
}
