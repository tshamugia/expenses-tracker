import type {
  MonthClose,
  MonthlyPlan,
  PlanAllocation,
  PlanStatus,
} from '@prisma/client'
import type {
  AllocationKind,
  DeficitInfo,
} from '@/lib/services/plan-engine'
import type { VerdictKind } from '@/lib/services/verdict'
import type { StabilityStage } from '@/lib/services/stability'

/**
 * Plan Types (Phase 4) — view models for the monthly-plan lifecycle, the
 * dashboard and the stability path. Prisma Decimal fields are serialized to
 * number for client components.
 */

export type { PlanStatus, AllocationKind, VerdictKind, StabilityStage }

export type SerializedAllocation = Omit<PlanAllocation, 'planned' | 'actual'> & {
  planned: number
  actual: number | null
}

export type SerializedPlan = Omit<
  MonthlyPlan,
  'forecastIncome' | 'forecastStable' | 'forecastVariable' | 'actualIncome' | 'safeToSpend'
> & {
  forecastIncome: number
  forecastStable: number
  forecastVariable: number
  actualIncome: number | null
  safeToSpend: number
}

export type SerializedMonthClose = Omit<
  MonthClose,
  | 'completionPct'
  | 'netChange'
  | 'plannedNetChange'
  | 'debtPrincipalDelta'
  | 'reserveDelta'
  | 'goalsDelta'
  | 'newDebt'
  | 'withdrawals'
> & {
  completionPct: number
  netChange: number
  plannedNetChange: number
  debtPrincipalDelta: number
  reserveDelta: number
  goalsDelta: number
  newDebt: number
  withdrawals: number
  conclusions: PlanConclusion[]
}

/** A conclusion carried into the next plan (stored in MonthClose.conclusions). */
export interface PlanConclusion {
  type: 'raise_limit'
  categoryId: string
  categoryName?: string
  delta: number
  note?: string
}

/** Live actual spent/moved per allocation, for the CONFIRMED view. */
export interface AllocationLive {
  allocation: SerializedAllocation
  actual: number // spent/moved so far this month
}

/** Everything the /plan page needs for the active/draft plan. */
export interface PlanView {
  plan: SerializedPlan
  allocations: SerializedAllocation[]
  live: AllocationLive[] | null // populated for CONFIRMED plans
  deficit: DeficitInfo | null
  safeToSpendMonth: number
  safeToSpendDay: number
  spentFree: number // discretionary spend so far
  daysLeft: number
  windfall: WindfallProposal | null
  defaultCurrency: string
}

export interface WindfallProposal {
  excess: number
  toDebt: number
  toGoals: number
  toFree: number
}

/** Month-close preview: plan vs actual + proposed conclusions + verdict. */
export interface ClosePreview {
  plan: SerializedPlan
  lines: {
    kind: AllocationKind
    label: string
    refId: string | null
    planned: number
    actual: number
    deltaPct: number | null
  }[]
  proposedConclusions: PlanConclusion[]
  verdict: {
    kind: VerdictKind
    netChange: number
    components: { debt: number; reserve: number; goals: number; newDebt: number }
  }
  plannedNetChange: number
  completionPct: number
  defaultCurrency: string
}

// --- dashboard ---------------------------------------------------------------

export interface MainGoalCard {
  paidOrSavedPct: number
  remaining: number
  projectedDate: Date | null
}

export interface StabilityProgress {
  stage: StabilityStage
  reserve: { saved: number; oneMonthTarget: number; threeMonthTarget: number }
  debtFree: MainGoalCard
  reserveProgress: MainGoalCard
  netPosition: number
  netPositionTrend: { month: string; net: number }[] // last 6 months
  verdictHistory: { month: string; verdict: VerdictKind; netChange: number }[]
  defaultCurrency: string
}

export interface DashboardData {
  hasPlan: boolean
  currentMonth: string // "2026-09"
  safeToSpendMonth: number
  safeToSpendDay: number
  spentFree: number
  daysLeft: number
  planStatus: PlanStatus | null
  completionPct: number | null
  liveVerdict: {
    kind: VerdictKind
    netChange: number
    components: { debt: number; reserve: number; goals: number; newDebt: number }
  } | null
  stability: StabilityProgress
  debts: {
    totalRemainingPrincipal: number
    nextPayment: {
      debtId: string
      debtName: string
      dueDate: Date
      amount: number
      currency: string
    } | null
  }
  otherGoals: {
    goalId: string
    name: string
    percent: number
    status: string
  }[]
  defaultCurrency: string
}

export interface ConfirmAdjustment {
  allocationId: string
  planned: number // new planned amount (deficit resolution / inline edit)
}

export interface CloseDecision {
  conclusions: PlanConclusion[] // the subset the user accepted
}
