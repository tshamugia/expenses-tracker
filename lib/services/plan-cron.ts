/**
 * Monthly-plan cron glue (Phase 4 §7). Two rhythms:
 *  - on the 1st: generate every active user's plan and send the "plan ready"
 *    digest (ს1)
 *  - in the last days of the month: remind users with a still-open confirmed
 *    plan to close it (ს4)
 * "Active users" are those with an emergency fund (created on first app load),
 * a good proxy for someone actually using the finance features.
 */

import { getDaysInMonth } from 'date-fns'
import prisma from '@/lib/db/prisma'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { generatePlanForUser } from '@/lib/services/plan-generation'
import { closePlanForUser } from '@/lib/services/plan-close'
import {
  notifyMonthCloseReminder,
  notifyMonthClosed,
  notifyPlanReady,
} from '@/lib/services/notification-service'
import { toMonthKey } from '@/lib/services/plan-input'

/** Days from month end within which the close reminder fires. */
export const CLOSE_REMINDER_WINDOW_DAYS = 3

async function activeUserIds(): Promise<string[]> {
  const reserves = await prisma.goal.findMany({
    where: { isEmergencyFund: true },
    select: { userId: true },
  })
  return [...new Set(reserves.map((r) => r.userId))]
}

/**
 * Generate the current month's plan for every active user and send the digest.
 * Skips users whose month is already confirmed/closed. Returns how many plans
 * were generated. Per-user failures are logged, never fatal.
 */
export async function generateMonthlyPlansForAllUsers(
  now: Date = new Date()
): Promise<number> {
  const month = toMonthKey(now)
  const userIds = await activeUserIds()
  let generated = 0

  for (const userId of userIds) {
    try {
      const gen = await generatePlanForUser(userId, month)
      if (gen.skipped || !gen.planId) continue
      const plan = await prisma.monthlyPlan.findUnique({
        where: { id: gen.planId },
        select: { safeToSpend: true, currency: true },
      })
      generated++
      try {
        await notifyPlanReady(userId, {
          month,
          safeToSpend: formatCurrency(Number(plan?.safeToSpend ?? 0), plan?.currency ?? 'GEL'),
        })
      } catch (error) {
        console.error(`Error notifying plan ready for ${userId}:`, error)
      }
    } catch (error) {
      console.error(`Error generating plan for ${userId}:`, error)
    }
  }
  return generated
}

/**
 * Remind users with an open (confirmed, unclosed) plan for the current month to
 * close it, in the last few days of the month. Returns how many reminders were
 * sent. Runs only inside the reminder window; a no-op otherwise.
 */
export async function sendMonthCloseReminders(now: Date = new Date()): Promise<number> {
  const daysLeft = getDaysInMonth(now) - now.getDate()
  if (daysLeft > CLOSE_REMINDER_WINDOW_DAYS) return 0 // not yet in the last-days window

  const month = toMonthKey(now)
  const openPlans = await prisma.monthlyPlan.findMany({
    where: { month, status: 'CONFIRMED' },
    select: { userId: true },
  })

  let sent = 0
  for (const { userId } of openPlans) {
    try {
      await notifyMonthCloseReminder(userId, { month })
      sent++
    } catch (error) {
      console.error(`Error sending close reminder for ${userId}:`, error)
    }
  }
  return sent
}

/**
 * Auto-close any still-open (CONFIRMED) plan for a month that has fully elapsed
 * (Phase 4b follow-up). Month keys are "YYYY-MM", so a lexicographic `< current`
 * comparison selects every past month. Each is closed via the shared, session-
 * free close core (no user-selected conclusions — auto-close accepts none) and a
 * summary digest is sent. A CLOSED month is never matched. Returns how many were
 * closed. Per-user failures are logged, never fatal.
 */
export async function autoCloseElapsedMonths(now: Date = new Date()): Promise<number> {
  const currentMonth = toMonthKey(now)
  const elapsedPlans = await prisma.monthlyPlan.findMany({
    where: { status: 'CONFIRMED', month: { lt: currentMonth } },
    select: { id: true, userId: true, month: true },
  })

  let closed = 0
  for (const plan of elapsedPlans) {
    try {
      const result = await closePlanForUser(plan.userId, plan.id)
      if (!result.ok) continue
      closed++
      try {
        await notifyMonthClosed(plan.userId, {
          month: plan.month,
          verdict: result.data.verdict.kind,
          netChange: formatCurrency(
            result.data.verdict.netChange,
            result.data.defaultCurrency
          ),
        })
      } catch (error) {
        console.error(`Error notifying month closed for ${plan.userId}:`, error)
      }
    } catch (error) {
      console.error(`Error auto-closing plan ${plan.id} for ${plan.userId}:`, error)
    }
  }
  return closed
}
