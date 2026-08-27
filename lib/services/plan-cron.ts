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
import {
  notifyMonthCloseReminder,
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
