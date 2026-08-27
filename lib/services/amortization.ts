/**
 * Debt amortization engine (Phase 2, PRD §7.3 / D1 / ს5).
 * Pure functions: no DB, no auth, no Date.now — fully unit-testable.
 *
 * Annuity formula: A = P · r / (1 − (1+r)^−n),  r = annualRatePct / 100 / 12
 * All money is `number`, rounded to 2 decimals (round half up) at every step —
 * the banking standard, so stored history matches what the user was charged.
 */

import { addMonths } from 'date-fns'

/** Round to 2 decimals, half up. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Monthly interest rate from an annual percentage (e.g. 18 → 0.015). */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12
}

/**
 * Annuity payment for a principal over a fixed term.
 * 0% rate degrades gracefully to principal / term (avoids the 0/0 form).
 */
export function calcAnnuityPayment(
  principal: number,
  annualRatePct: number,
  termMonths: number
): number {
  if (termMonths <= 0) {
    throw new Error('termMonths must be greater than zero')
  }
  const r = monthlyRate(annualRatePct)
  if (r === 0) {
    return roundMoney(principal / termMonths)
  }
  const payment = (principal * r) / (1 - Math.pow(1 + r, -termMonths))
  return roundMoney(payment)
}

/**
 * Term (whole months) implied by a fixed monthly payment.
 * Throws when the payment does not exceed the first month's interest — the
 * balance would never amortize ("the debt would never be paid off").
 */
export function calcTermMonths(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number
): number {
  if (monthlyPayment <= 0) {
    throw new Error('monthlyPayment must be greater than zero')
  }
  const r = monthlyRate(annualRatePct)
  if (r === 0) {
    return Math.ceil(principal / monthlyPayment)
  }
  const firstInterest = principal * r
  if (monthlyPayment <= firstInterest) {
    throw new Error(
      'Monthly payment is too low — the debt would never be paid off'
    )
  }
  const n = -Math.log(1 - (principal * r) / monthlyPayment) / Math.log(1 + r)
  // Snap to a whole term when the payment lands on an exact annuity (float
  // noise would otherwise push e.g. 24.0000001 up to 25); else round up.
  const nearest = Math.round(n)
  return Math.abs(n - nearest) < 1e-3 ? nearest : Math.ceil(n)
}

export type ScheduleRow = {
  seq: number
  dueDate: Date
  payment: number
  interestPart: number
  principalPart: number
  remainingPrincipal: number
}

/**
 * Amortize a balance from a starting point at a fixed monthly payment.
 * Stops when the balance is cleared; the last row absorbs the rounding
 * remainder so remainingPrincipal lands on exactly 0. Shared by buildSchedule
 * and the prepayment simulators.
 */
function amortize(
  startBalance: number,
  monthlyPayment: number,
  r: number,
  startSeq: number,
  firstDueDate: Date
): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  let balance = roundMoney(startBalance)
  let seq = startSeq
  // Safety cap: no consumer debt runs past this; guards against a payment that
  // never amortizes slipping through.
  const MAX_ROWS = 1200

  while (balance > 0 && rows.length < MAX_ROWS) {
    const interestPart = roundMoney(balance * r)
    const regularPrincipal = roundMoney(monthlyPayment - interestPart)

    if (regularPrincipal <= 0) {
      throw new Error(
        'Monthly payment is too low — the debt would never be paid off'
      )
    }

    let principalPart: number
    let payment: number
    if (regularPrincipal >= balance) {
      // Final installment: pay off exactly what remains.
      principalPart = balance
      payment = roundMoney(interestPart + principalPart)
    } else {
      principalPart = regularPrincipal
      payment = roundMoney(interestPart + principalPart)
    }

    balance = roundMoney(balance - principalPart)
    rows.push({
      seq,
      dueDate: addMonths(firstDueDate, seq - startSeq),
      payment,
      interestPart,
      principalPart,
      remainingPrincipal: balance,
    })
    seq += 1
  }

  return rows
}

/**
 * Build the full amortization schedule for a new debt.
 * payment is the annuity for (principal, rate, termMonths); the last row
 * adjusts the rounding remainder so the final remainingPrincipal is exactly 0.
 */
export function buildSchedule(input: {
  principal: number
  annualRatePct: number
  termMonths: number
  firstPaymentDate: Date
}): ScheduleRow[] {
  const { principal, annualRatePct, termMonths, firstPaymentDate } = input
  const r = monthlyRate(annualRatePct)
  const payment = calcAnnuityPayment(principal, annualRatePct, termMonths)

  // For a fixed term we generate exactly termMonths rows, forcing the last one
  // to clear the balance (a fixed annuity + per-step rounding can otherwise
  // leave a few tetri on the final row).
  const rows: ScheduleRow[] = []
  let balance = roundMoney(principal)
  for (let seq = 1; seq <= termMonths; seq++) {
    const isLast = seq === termMonths
    const interestPart = roundMoney(balance * r)
    const principalPart = isLast
      ? balance
      : roundMoney(payment - interestPart)
    const rowPayment = roundMoney(interestPart + principalPart)
    balance = roundMoney(balance - principalPart)
    rows.push({
      seq,
      dueDate: addMonths(firstPaymentDate, seq - 1),
      payment: rowPayment,
      interestPart,
      principalPart,
      remainingPrincipal: balance,
    })
  }
  return rows
}

/**
 * Build a schedule from a fixed monthly payment (used when the user enters a
 * payment instead of a term). Regular installments keep the given payment; the
 * final row is smaller. Throws when the payment never amortizes the balance.
 */
export function buildScheduleFromPayment(input: {
  principal: number
  annualRatePct: number
  monthlyPayment: number
  firstPaymentDate: Date
}): ScheduleRow[] {
  const { principal, annualRatePct, monthlyPayment, firstPaymentDate } = input
  const r = monthlyRate(annualRatePct)
  if (r > 0 && monthlyPayment <= roundMoney(principal * r)) {
    throw new Error(
      'Monthly payment is too low — the debt would never be paid off'
    )
  }
  return amortize(principal, monthlyPayment, r, 1, firstPaymentDate)
}

export type ScheduleSummary = {
  totalInterest: number
  totalPaid: number
  totalPrincipal: number
  endDate: Date | null
}

/** Totals for a schedule (preview + detail summary). */
export function summarizeSchedule(schedule: ScheduleRow[]): ScheduleSummary {
  const totalInterest = roundMoney(
    schedule.reduce((sum, row) => sum + row.interestPart, 0)
  )
  const totalPrincipal = roundMoney(
    schedule.reduce((sum, row) => sum + row.principalPart, 0)
  )
  const totalPaid = roundMoney(
    schedule.reduce((sum, row) => sum + row.payment, 0)
  )
  return {
    totalInterest,
    totalPaid,
    totalPrincipal,
    endDate: schedule.length ? schedule[schedule.length - 1].dueDate : null,
  }
}

export type PrepaymentSimResult = {
  monthsSaved: number
  interestSaved: number
  newEndDate: Date
  newSchedule: ScheduleRow[]
}

/** Opening balance before a given row's principal is applied. */
function balanceBefore(row: ScheduleRow): number {
  return roundMoney(row.remainingPrincipal + row.principalPart)
}

function sumInterest(rows: ScheduleRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + row.interestPart, 0))
}

/**
 * Simulate paying `extra` on top of the regular installment every month from
 * `fromSeq` onward (payment up, term shortens — the default behaviour).
 * extra = 0 returns the unchanged tail (monthsSaved 0, interestSaved 0).
 */
export function simulateExtraMonthly(
  current: ScheduleRow[],
  fromSeq: number,
  extra: number,
  rate: number
): PrepaymentSimResult {
  const r = monthlyRate(rate)
  const startIdx = current.findIndex((row) => row.seq === fromSeq)
  if (startIdx === -1) {
    throw new Error(`Schedule has no row with seq ${fromSeq}`)
  }
  const startRow = current[startIdx]
  const oldTail = current.slice(startIdx)
  const startBalance = balanceBefore(startRow)
  const newPayment = roundMoney(startRow.payment + extra)

  const newTail = amortize(startBalance, newPayment, r, fromSeq, startRow.dueDate)
  const newSchedule = current.slice(0, startIdx).concat(newTail)

  return {
    monthsSaved: oldTail.length - newTail.length,
    interestSaved: roundMoney(sumInterest(oldTail) - sumInterest(newTail)),
    newEndDate: newTail[newTail.length - 1].dueDate,
    newSchedule,
  }
}

/**
 * Simulate a one-off lump sum applied at `atSeq` (installment unchanged, term
 * shortens). A lump ≥ the remaining principal closes the debt that same month.
 */
export function simulateLumpSum(
  current: ScheduleRow[],
  atSeq: number,
  amount: number,
  rate: number
): PrepaymentSimResult {
  const r = monthlyRate(rate)
  const startIdx = current.findIndex((row) => row.seq === atSeq)
  if (startIdx === -1) {
    throw new Error(`Schedule has no row with seq ${atSeq}`)
  }
  const startRow = current[startIdx]
  const oldTail = current.slice(startIdx)
  const startBalance = balanceBefore(startRow)
  const reduced = roundMoney(startBalance - amount)

  let newTail: ScheduleRow[]
  if (reduced <= 0) {
    // Lump alone clears the debt this month.
    const interestPart = roundMoney(startBalance * r)
    newTail = [
      {
        seq: atSeq,
        dueDate: startRow.dueDate,
        payment: roundMoney(startBalance + interestPart),
        interestPart,
        principalPart: startBalance,
        remainingPrincipal: 0,
      },
    ]
  } else {
    newTail = amortize(reduced, startRow.payment, r, atSeq, startRow.dueDate)
  }

  const newSchedule = current.slice(0, startIdx).concat(newTail)

  return {
    monthsSaved: oldTail.length - newTail.length,
    interestSaved: roundMoney(sumInterest(oldTail) - sumInterest(newTail)),
    newEndDate: newTail[newTail.length - 1].dueDate,
    newSchedule,
  }
}

export type RankableDebt = {
  id: string
  annualRatePct: number
  remainingPrincipal: number
}

/**
 * Rank debts for an extra payment.
 * - avalanche (default, mathematically cheapest): highest rate first
 * - snowball (motivational): smallest balance first
 * Ties keep the input order (stable).
 */
export function rankDebtsForExtra<T extends RankableDebt>(
  debts: T[],
  strategy: 'avalanche' | 'snowball'
): T[] {
  return debts
    .map((debt, index) => ({ debt, index }))
    .sort((a, b) => {
      const primary =
        strategy === 'avalanche'
          ? b.debt.annualRatePct - a.debt.annualRatePct
          : a.debt.remainingPrincipal - b.debt.remainingPrincipal
      return primary !== 0 ? primary : a.index - b.index
    })
    .map((entry) => entry.debt)
}
