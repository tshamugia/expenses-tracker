/**
 * Stable-income auto-accrual.
 * Active STABLE sources with an expected amount are credited to the ledger
 * automatically every month (on the expected day, or the 1st) — the user
 * never enters them by hand. VARIABLE income stays manual.
 *
 * Idempotency: each accrual carries a deterministic externalId
 * (`auto:<sourceId>:<yyyy-MM>`); the Transaction @@unique([userId, externalId])
 * constraint plus createMany({ skipDuplicates }) makes re-runs and races safe.
 * Runs lazily on /income page load and daily via the notification cron.
 */

import { startOfDay } from 'date-fns'
import prisma from '@/lib/db/prisma'

/** Backfill window: how many past months a missed accrual is created for. */
export const MAX_ACCRUAL_MONTHS_BACK = 12

export interface StableSourceForAccrual {
  id: string
  expectedAmount: number
  currency: string
  expectedDay: number | null
  createdAt: Date
}

export interface DueAccrual {
  incomeSourceId: string
  amount: number
  currency: string
  date: Date
  externalId: string
}

/** Deterministic dedup key for one source + month (monthIndex is 0-based). */
export function accrualKey(sourceId: string, year: number, monthIndex: number): string {
  return `auto:${sourceId}:${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** Accrual date within a month: expected day clamped to the month length (1st when unset). */
export function accrualDateFor(
  year: number,
  monthIndex: number,
  expectedDay: number | null
): Date {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const day = Math.min(expectedDay ?? 1, daysInMonth)
  return new Date(year, monthIndex, day)
}

/**
 * Pure engine: which accruals are due right now.
 * A month is due when its accrual date has arrived, is not before the source
 * was created, and no transaction with that accrual key exists yet.
 */
export function computeDueAccruals(params: {
  sources: StableSourceForAccrual[]
  existingKeys: ReadonlySet<string>
  now: Date
}): DueAccrual[] {
  const { sources, existingKeys, now } = params
  const due: DueAccrual[] = []

  for (const source of sources) {
    if (!Number.isFinite(source.expectedAmount) || source.expectedAmount <= 0) {
      continue
    }
    const createdFloor = startOfDay(source.createdAt)

    for (let offset = MAX_ACCRUAL_MONTHS_BACK; offset >= 0; offset--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const date = accrualDateFor(
        monthStart.getFullYear(),
        monthStart.getMonth(),
        source.expectedDay
      )
      if (date < createdFloor || date > now) continue

      const externalId = accrualKey(source.id, monthStart.getFullYear(), monthStart.getMonth())
      if (existingKeys.has(externalId)) continue

      due.push({
        incomeSourceId: source.id,
        amount: source.expectedAmount,
        currency: source.currency,
        date,
        externalId,
      })
    }
  }

  return due
}

/**
 * Accrue all due stable income for one user. Returns how many transactions
 * were created. Safe to call on every /income page load.
 */
export async function accrueStableIncomeForUser(
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const sources = await prisma.incomeSource.findMany({
    where: { userId, type: 'STABLE', isActive: true, expectedAmount: { not: null } },
    select: {
      id: true,
      expectedAmount: true,
      currency: true,
      expectedDay: true,
      createdAt: true,
    },
  })
  if (sources.length === 0) return 0

  const existing = await prisma.transaction.findMany({
    where: { userId, entrySource: 'AUTO', externalId: { startsWith: 'auto:' } },
    select: { externalId: true },
  })
  const existingKeys = new Set(
    existing.map((t) => t.externalId).filter((id): id is string => id !== null)
  )

  const due = computeDueAccruals({
    sources: sources.map((s) => ({
      id: s.id,
      expectedAmount: Number(s.expectedAmount),
      currency: s.currency,
      expectedDay: s.expectedDay,
      createdAt: s.createdAt,
    })),
    existingKeys,
    now,
  })
  if (due.length === 0) return 0

  const result = await prisma.transaction.createMany({
    data: due.map((d) => ({
      userId,
      type: 'INCOME' as const,
      amount: d.amount,
      currency: d.currency,
      date: d.date,
      incomeSourceId: d.incomeSourceId,
      entrySource: 'AUTO' as const,
      externalId: d.externalId,
    })),
    skipDuplicates: true, // concurrent runs collapse on @@unique([userId, externalId])
  })

  return result.count
}

/** Accrue for every user with active stable sources (daily cron). */
export async function accrueStableIncomeForAllUsers(
  now: Date = new Date()
): Promise<number> {
  const users = await prisma.incomeSource.findMany({
    where: { type: 'STABLE', isActive: true, expectedAmount: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  })

  let created = 0
  for (const { userId } of users) {
    created += await accrueStableIncomeForUser(userId, now)
  }
  return created
}
