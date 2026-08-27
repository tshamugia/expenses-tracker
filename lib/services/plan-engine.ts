/**
 * Monthly-plan engine — the waterfall (Phase 4, PRD §6 / §7.5 / D3).
 * Pure function: no DB, no auth, no Date.now — fully unit-testable. This is the
 * heart of the product and the engine runs entirely on our own logic (D3 — no
 * Claude in the loop).
 *
 * Distribution order is strict (§6):
 *   MANDATORY + VARIABLE targets → DEBT → RESERVE → GOAL (by priority) → FREE
 * FREE is what remains = Safe to spend. The reserve precedes every other goal
 * until its target is filled. The system never cuts anything on its own: if
 * income can't cover the waterfall it saves the draft with a `deficit` describing
 * the shortfall and the options, and the user chooses.
 */

import type { IncomeForecast } from '@/lib/services/income-forecast'

/** Allocation kinds — string values match the Prisma `AllocationKind` enum. */
export type AllocationKind =
  | 'MANDATORY'
  | 'DEBT'
  | 'RESERVE'
  | 'GOAL'
  | 'VARIABLE'
  | 'FREE'

export type AllocationDraft = {
  kind: AllocationKind
  refId: string | null
  label: string
  planned: number
}

/** A conclusion carried from the previous month's close into the next plan. */
export type Conclusion = {
  type: 'raise_limit'
  categoryId: string
  delta: number
  note?: string
}

export type DeficitOption =
  | { type: 'pause_goal'; goalId: string; label: string; frees: number }
  | { type: 'reduce_goal'; goalId: string; label: string; currentAmount: number }
  | {
      type: 'trim_variable'
      categoryId: string
      label: string
      currentAmount: number
    }

export type DeficitInfo = {
  shortfall: number // amount by which the waterfall exceeds forecast income
  failedAtKind: AllocationKind // the tier where income ran out
  failedAtLabel: string
  options: DeficitOption[]
}

export type PlanInput = {
  forecast: IncomeForecast
  mandatoryFixed: { label: string; amount: number; refId?: string | null }[]
  variableTargets: { categoryId: string; label: string; amount: number }[]
  debtInstallments: { debtId: string; label: string; amount: number }[]
  reserve: {
    goalId: string
    label: string
    monthlyContribution: number
    remaining: number
  } | null
  goals: {
    goalId: string
    label: string
    monthlyContribution: number
    remaining: number
    priority: number
  }[]
  conclusions: Conclusion[]
  daysInMonth: number
}

export type PlanResult = {
  allocations: AllocationDraft[]
  safeToSpendMonth: number
  safeToSpendDay: number
  deficit: DeficitInfo | null
  // --- goal-driven layer (Phase 4b) ---
  /** X — total to set aside this month: reserve + goal contributions. */
  requiredSetAside: number
  /** Income left for savings after obligations (mandatory + debt). */
  availableForGoals: number
  /** Whether X fits in availableForGoals (goals are all fundable this month). */
  feasible: boolean
  /** How much X exceeds availableForGoals (0 when feasible). */
  shortfall: number
}

/** Round to 2 decimals, half up (shared banking rounding). */
function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Floor to 2 decimals — the daily safe-to-spend is always rounded down. */
function floorMoney(n: number): number {
  return Math.floor(n * 100) / 100
}

/**
 * Generate the month's plan from the forecast and the waterfall inputs.
 * Non-FREE allocations always carry their full planned amounts (the system cuts
 * nothing); FREE = max(0, income − everything above). A negative remainder
 * surfaces as `deficit` instead of a negative FREE.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const available = roundMoney(input.forecast.total)
  const allocations: AllocationDraft[] = []

  // Tier 1a — mandatory fixed obligations
  for (const m of input.mandatoryFixed) {
    if (m.amount <= 0) continue
    allocations.push({
      kind: 'MANDATORY',
      refId: m.refId ?? null,
      label: m.label,
      planned: roundMoney(m.amount),
    })
  }

  // Tier 1b — variable-category targets, adjusted by prior-month conclusions
  const raiseByCategory = new Map<string, number>()
  for (const c of input.conclusions) {
    if (c.type === 'raise_limit') {
      raiseByCategory.set(
        c.categoryId,
        (raiseByCategory.get(c.categoryId) ?? 0) + c.delta
      )
    }
  }
  for (const v of input.variableTargets) {
    const adjusted = roundMoney(v.amount + (raiseByCategory.get(v.categoryId) ?? 0))
    if (adjusted <= 0) continue
    allocations.push({
      kind: 'VARIABLE',
      refId: v.categoryId,
      label: v.label,
      planned: adjusted,
    })
  }

  // Tier 2 — debt installments
  for (const d of input.debtInstallments) {
    if (d.amount <= 0) continue
    allocations.push({
      kind: 'DEBT',
      refId: d.debtId,
      label: d.label,
      planned: roundMoney(d.amount),
    })
  }

  // Tier 3 — reserve (priority #1 among savings; capped at what's left to fill)
  if (input.reserve) {
    const planned = roundMoney(
      Math.min(input.reserve.monthlyContribution, input.reserve.remaining)
    )
    if (planned > 0) {
      allocations.push({
        kind: 'RESERVE',
        refId: input.reserve.goalId,
        label: input.reserve.label,
        planned,
      })
    }
  }

  // Tier 4 — goals in priority order (capped at each goal's remaining)
  const sortedGoals = [...input.goals].sort((a, b) => a.priority - b.priority)
  for (const g of sortedGoals) {
    const planned = roundMoney(Math.min(g.monthlyContribution, g.remaining))
    if (planned <= 0) continue
    allocations.push({
      kind: 'GOAL',
      refId: g.goalId,
      label: g.label,
      planned,
    })
  }

  // Find where the waterfall runs dry (cumulative sum first exceeds income)
  let running = 0
  let failedAt: AllocationDraft | null = null
  for (const a of allocations) {
    running = roundMoney(running + a.planned)
    if (failedAt === null && running > available) {
      failedAt = a
    }
  }
  const totalAllocated = running

  const remainder = roundMoney(available - totalAllocated)
  const safeToSpendMonth = Math.max(0, remainder)
  const safeToSpendDay =
    input.daysInMonth > 0 ? floorMoney(safeToSpendMonth / input.daysInMonth) : 0

  // FREE allocation always present (Safe to spend for the month)
  allocations.push({
    kind: 'FREE',
    refId: null,
    label: 'Safe to spend',
    planned: safeToSpendMonth,
  })

  let deficit: DeficitInfo | null = null
  if (failedAt !== null) {
    deficit = {
      shortfall: roundMoney(-remainder),
      failedAtKind: failedAt.kind,
      failedAtLabel: failedAt.label,
      options: buildDeficitOptions(input),
    }
  }

  // --- goal-driven layer (Phase 4b): the required set-aside X and whether it
  // fits in the money left after obligations. This is additive — it does not
  // change safeToSpendMonth; it reframes the plan around goals for the UI. ---
  const sumKind = (...kinds: AllocationKind[]) =>
    roundMoney(
      allocations
        .filter((a) => kinds.includes(a.kind))
        .reduce((s, a) => s + a.planned, 0)
    )
  const requiredSetAside = sumKind('RESERVE', 'GOAL')
  const availableForGoals = roundMoney(available - sumKind('MANDATORY', 'DEBT'))
  const feasible = requiredSetAside <= availableForGoals + 1e-9
  const shortfall = Math.max(0, roundMoney(requiredSetAside - availableForGoals))

  return {
    allocations,
    safeToSpendMonth,
    safeToSpendDay,
    deficit,
    requiredSetAside,
    availableForGoals,
    feasible,
    shortfall,
  }
}

/**
 * Concrete ways to close a deficit, for the user to choose (§6.2). Lowest-
 * priority goals are offered for pause/reduce first; variable targets for trim.
 * The engine only proposes — it never applies a cut.
 */
function buildDeficitOptions(input: PlanInput): DeficitOption[] {
  const options: DeficitOption[] = []

  const goalsLowestFirst = [...input.goals]
    .filter((g) => Math.min(g.monthlyContribution, g.remaining) > 0)
    .sort((a, b) => b.priority - a.priority)

  for (const g of goalsLowestFirst) {
    const amount = roundMoney(Math.min(g.monthlyContribution, g.remaining))
    options.push({
      type: 'pause_goal',
      goalId: g.goalId,
      label: g.label,
      frees: amount,
    })
    options.push({
      type: 'reduce_goal',
      goalId: g.goalId,
      label: g.label,
      currentAmount: amount,
    })
  }

  for (const v of input.variableTargets) {
    if (v.amount <= 0) continue
    options.push({
      type: 'trim_variable',
      categoryId: v.categoryId,
      label: v.label,
      currentAmount: roundMoney(v.amount),
    })
  }

  return options
}
