import type { Goal, GoalContribution, GoalStatus } from '@prisma/client'
import type { GoalProgress } from '@/lib/services/goal-math'

/**
 * Goal Types (Phase 3)
 * Type definitions for goals, the emergency fund, contributions/withdrawals,
 * the goals overview and per-goal detail.
 */

export type { GoalStatus }
export type { GoalProgress }

// Serialized goal for client components (Decimal → number)
export type SerializedGoal = Omit<
  Goal,
  'targetAmount' | 'monthlyContribution'
> & {
  targetAmount: number
  monthlyContribution: number | null
}

// Serialized contribution/withdrawal row (Decimal → number)
export type SerializedContribution = Omit<GoalContribution, 'amount'> & {
  amount: number
}

export interface CreateGoalInput {
  name: string
  targetAmount: number
  currency?: string
  // provide at least one; the action derives and stores the other
  targetDate?: Date | null
  monthlyContribution?: number | null
}

export interface UpdateGoalInput {
  name?: string
  targetAmount?: number
  targetDate?: Date | null
  monthlyContribution?: number | null
}

// How the reserve's auto target is explained in the UI ("1 month = 2,100₾")
export interface ReserveExplanation {
  mandatoryMonthly: number
  stage: number // 1 or 3
}

// What-if impact of approving a PROPOSED goal on the current month's plan.
export interface GoalWhatIf {
  safeBefore: number // monthly Safe-to-Spend as it stands today
  safeAfter: number // monthly Safe-to-Spend if this goal were approved
  deltaMonthly: number // reduction in monthly Safe-to-Spend (safeBefore - safeAfter)
}

export interface GoalListItem {
  goal: SerializedGoal
  progress: GoalProgress
  reserve?: ReserveExplanation // present only for the emergency fund
  whatIf?: GoalWhatIf // present only for PROPOSED goals (browsing the wishlist)
}

// Everything the /goals list page needs in one payload
export interface GoalsOverview {
  goals: GoalListItem[] // priority order, reserve first
  defaultCurrency: string
}

// Everything the goal detail view needs
export interface GoalDetail {
  goal: SerializedGoal
  contributions: SerializedContribution[]
  progress: GoalProgress
  reserve?: ReserveExplanation
}

export interface ContributeInput {
  amount: number
  date?: Date
}

export interface WithdrawInput {
  amount: number
  reason: string
  date?: Date
}
