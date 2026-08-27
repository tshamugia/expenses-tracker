/**
 * Month verdict engine (Phase 4, PRD §7.6 / R9 — an honest verdict).
 * Pure function: no DB, no auth, no Date.now — fully unit-testable.
 *
 * The verdict answers one question honestly: did the user's net position move
 * FORWARD or BACK this month? A plan can be "100% completed" and still be BACK —
 * e.g. money went into a goal but more came out of the reserve, or new debt was
 * taken. So the verdict is computed from real balance movements, not plan
 * adherence:
 *
 *   netChange = debtPrincipalPaid + reserveNet + goalsNet − newDebtPrincipal
 *
 * A ±5₾ band around zero counts as FLAT (rounding noise, not real progress).
 */

import { roundMoney } from '@/lib/services/amortization'

export type VerdictKind = 'FORWARD' | 'BACK' | 'FLAT'

export type VerdictInput = {
  debtPrincipalPaid: number // principal cleared this month (+)
  reserveNet: number // reserve contributions − withdrawals
  goalsNet: number // goal contributions − withdrawals
  newDebtPrincipal: number // new debt taken this month (reduces net worth)
}

export type VerdictResult = {
  netChange: number
  verdict: VerdictKind
  components: {
    debt: number
    reserve: number
    goals: number
    newDebt: number
  }
}

/** ±band (₾) around zero that counts as FLAT. */
export const FLAT_THRESHOLD = 5

export function calcVerdict(input: VerdictInput): VerdictResult {
  const debt = roundMoney(input.debtPrincipalPaid)
  const reserve = roundMoney(input.reserveNet)
  const goals = roundMoney(input.goalsNet)
  const newDebt = roundMoney(input.newDebtPrincipal)

  const netChange = roundMoney(debt + reserve + goals - newDebt)

  let verdict: VerdictKind
  if (Math.abs(netChange) <= FLAT_THRESHOLD) {
    verdict = 'FLAT'
  } else if (netChange > 0) {
    verdict = 'FORWARD'
  } else {
    verdict = 'BACK'
  }

  return {
    netChange,
    verdict,
    components: { debt, reserve, goals, newDebt },
  }
}
