'use server'

/**
 * Notification Service
 * Handles checking for upcoming payments and sending email reminders
 */

import prisma from '@/lib/db/prisma'
import { getServerTranslator } from '@/i18n/server-translator'
import {
  sendCategoryLimitEmail,
  sendGoalMilestoneEmail,
  sendPaymentReminderEmail,
} from './email'
import { sendPushToUser } from './push-service'

export interface NotificationResult {
  success: boolean
  sentCount: number
  errors: string[]
}

/**
 * Check for upcoming payments and send email notifications
 * This should be called by a cron job or scheduled task
 *
 * Notification triggers (ONLY these two):
 * - Payments due in exactly 3 days (upcoming reminder)
 * - Overdue payments (past due date and not paid)
 *
 * Always sends BOTH email AND in-app notifications
 */
export async function sendUpcomingPaymentNotifications(): Promise<NotificationResult> {
  const errors: string[] = []
  let sentCount = 0

  try {
    // Get ALL users (we'll send notifications regardless of emailEnabled preference)
    // But we'll respect emailEnabled for sending actual emails
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        notificationPreferences: {
          select: {
            emailEnabled: true,
          },
        },
      },
    })

    console.log(`Found ${users.length} users to check for notifications`)

    const now = new Date()
    now.setHours(0, 0, 0, 0) // Start of today

    const threeDaysFromNow = new Date(now)
    threeDaysFromNow.setDate(now.getDate() + 3)
    threeDaysFromNow.setHours(23, 59, 59, 999) // End of day 3

    const threeDaysStart = new Date(now)
    threeDaysStart.setDate(now.getDate() + 3)
    threeDaysStart.setHours(0, 0, 0, 0) // Start of day 3

    // Process each user
    for (const user of users) {
      try {
        // Find payments that match our criteria:
        // 1. Due in exactly 3 days (between start and end of day 3)
        // 2. Overdue (before today)
        const paymentsToNotify = await prisma.payment.findMany({
          where: {
            expense: {
              userId: user.id,
            },
            paid: false,
            OR: [
              // Payments due in exactly 3 days
              {
                dueDate: {
                  gte: threeDaysStart,
                  lte: threeDaysFromNow,
                },
              },
              // Overdue payments (before today)
              {
                dueDate: {
                  lt: now,
                },
              },
            ],
          },
          include: {
            expense: {
              select: {
                title: true,
                currency: true,
              },
            },
          },
          orderBy: {
            dueDate: 'asc',
          },
        })

        if (paymentsToNotify.length === 0) {
          console.log(`User ${user.email}: No notifications needed`)
          continue
        }

        console.log(`User ${user.email}: Found ${paymentsToNotify.length} payments to notify`)

        // Process each payment
        for (const payment of paymentsToNotify) {
          const daysUntilDue = Math.ceil(
            (payment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )

          // Skip if snoozed
          if (payment.snoozedUntil && payment.snoozedUntil > now) {
            console.log(`  Skipping snoozed payment: ${payment.expense.title}`)
            continue
          }

          // Determine notification type and message based on days until due
          let notificationType: 'payment' | 'warning' | 'error' = 'payment'
          let notificationTitle = 'Payment Reminder'
          let messageText = ''

          if (daysUntilDue < 0) {
            // Overdue
            const daysOverdue = Math.abs(daysUntilDue)
            notificationType = 'error'
            notificationTitle = 'Overdue Payment'
            messageText = `${payment.expense.title} is ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue`
            console.log(`  Sending overdue notice for: ${payment.expense.title} (${daysOverdue} days overdue)`)
          } else if (daysUntilDue === 3) {
            // Due in 3 days
            notificationType = 'payment'
            notificationTitle = 'Payment Reminder'
            messageText = `${payment.expense.title} is due in 3 days`
            console.log(`  Sending 3-day reminder for: ${payment.expense.title}`)
          } else {
            // This shouldn't happen based on our query, but just in case
            console.log(`  Skipping unexpected payment: ${payment.expense.title} (${daysUntilDue} days)`)
            continue
          }

          // ALWAYS create in-app notification (regardless of email preference)
          await prisma.notification.create({
            data: {
              userId: user.id,
              title: notificationTitle,
              message: messageText,
              type: notificationType,
              actionUrl: '/expenses',
              metadata: JSON.stringify({
                paymentId: payment.id,
                expenseId: payment.expenseId,
                dueDate: payment.dueDate,
                amount: Number(payment.amount),
                isOverdue: daysUntilDue < 0,
                daysUntilDue,
              }),
            },
          })

          console.log(`  ✓ In-app notification created`)

          // Best-effort web push (no-op if push disabled / no subscriptions)
          await sendPushToUser(user.id, {
            title: notificationTitle,
            body: messageText,
            url: '/expenses',
          })

          // ALWAYS send email (regardless of emailEnabled preference)
          const emailResult = await sendPaymentReminderEmail({
            email: user.email,
            userName: user.name || undefined,
            expenseTitle: payment.expense.title,
            amount: Number(payment.amount),
            currency: payment.expense.currency,
            dueDate: payment.dueDate,
            daysUntilDue,
          })

          if (emailResult.success) {
            sentCount++
            console.log(`  ✓ Email sent successfully`)
          } else {
            const errorMsg = `Failed to send email to ${user.email} for ${payment.expense.title}: ${emailResult.error}`
            errors.push(errorMsg)
            console.error(`  ✗ ${errorMsg}`)
          }
        }
      } catch (error) {
        const errorMsg = `Error processing notifications for user ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error(errorMsg)
      }
    }

    return {
      success: true,
      sentCount,
      errors,
    }
  } catch (error) {
    console.error('Error in sendUpcomingPaymentNotifications:', error)
    return {
      success: false,
      sentCount,
      errors: [
        ...errors,
        error instanceof Error ? error.message : 'Unknown error occurred',
      ],
    }
  }
}

/**
 * Create instant notification when a new expense is added with past or overdue due date
 * This should be called immediately after creating an expense with a past due date
 *
 * Always sends BOTH email AND in-app notifications
 */
export async function notifyPastOrOverdueExpense(
  userId: string,
  expenseTitle: string,
  dueDate: Date,
  amount: number,
  currency: string,
  paymentId: string,
  expenseId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const dueDateNormalized = new Date(dueDate)
    dueDateNormalized.setHours(0, 0, 0, 0)

    const daysUntilDue = Math.ceil(
      (dueDateNormalized.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Only notify if the due date is in the past or today
    if (daysUntilDue > 0) {
      return { success: true } // Not overdue, no notification needed
    }

    let notificationType: 'warning' | 'error' = 'warning'
    let notificationTitle = 'New Payment Due Today'
    let messageText = ''

    if (daysUntilDue < 0) {
      // Overdue
      const daysOverdue = Math.abs(daysUntilDue)
      notificationType = 'error'
      notificationTitle = 'New Overdue Payment Added'
      messageText = `${expenseTitle} was due ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} ago`
      console.log(`Creating instant notification: ${expenseTitle} is ${daysOverdue} days overdue`)
    } else {
      // Due today
      messageText = `${expenseTitle} is due today`
      console.log(`Creating instant notification: ${expenseTitle} is due today`)
    }

    // ALWAYS create in-app notification
    await prisma.notification.create({
      data: {
        userId,
        title: notificationTitle,
        message: messageText,
        type: notificationType,
        actionUrl: '/expenses',
        metadata: JSON.stringify({
          paymentId,
          expenseId,
          dueDate,
          amount,
          isOverdue: daysUntilDue < 0,
          daysUntilDue,
          isNewExpense: true,
        }),
      },
    })

    console.log(`  ✓ In-app notification created`)

    // Best-effort web push (no-op if push disabled / no subscriptions)
    await sendPushToUser(userId, {
      title: notificationTitle,
      body: messageText,
      url: '/expenses',
    })

    // ALWAYS send email (regardless of emailEnabled preference)
    const emailResult = await sendPaymentReminderEmail({
      email: user.email,
      userName: user.name || undefined,
      expenseTitle,
      amount,
      currency,
      dueDate,
      daysUntilDue,
    })

    if (emailResult.success) {
      console.log(`  ✓ Email sent successfully`)
    } else {
      console.error(`  ✗ Failed to send email for new overdue expense: ${emailResult.error}`)
      // Don't return error, notification was still created
    }

    return { success: true }
  } catch (error) {
    console.error('Error in notifyPastOrOverdueExpense:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Manual trigger for testing - checks and sends notifications for a specific user
 * Same rules as main notification service:
 * - Only 3-day and overdue notifications
 * - Always sends both email and in-app notifications
 */
export async function sendUserPaymentNotifications(
  userId: string
): Promise<NotificationResult> {
  const errors: string[] = []
  let sentCount = 0

  try {
    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    })

    if (!user) {
      return {
        success: false,
        sentCount: 0,
        errors: ['User not found'],
      }
    }

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const threeDaysFromNow = new Date(now)
    threeDaysFromNow.setDate(now.getDate() + 3)
    threeDaysFromNow.setHours(23, 59, 59, 999)

    const threeDaysStart = new Date(now)
    threeDaysStart.setDate(now.getDate() + 3)
    threeDaysStart.setHours(0, 0, 0, 0)

    // Find payments: 3 days out OR overdue
    const paymentsToNotify = await prisma.payment.findMany({
      where: {
        expense: {
          userId,
        },
        paid: false,
        OR: [
          // Payments due in exactly 3 days
          {
            dueDate: {
              gte: threeDaysStart,
              lte: threeDaysFromNow,
            },
          },
          // Overdue payments
          {
            dueDate: {
              lt: now,
            },
          },
        ],
      },
      include: {
        expense: {
          select: {
            title: true,
            currency: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    })

    // Process each payment
    for (const payment of paymentsToNotify) {
      const daysUntilDue = Math.ceil(
        (payment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Skip if snoozed
      if (payment.snoozedUntil && payment.snoozedUntil > now) {
        continue
      }

      let notificationType: 'payment' | 'error' = 'payment'
      let notificationTitle = 'Payment Reminder'
      let messageText = ''

      if (daysUntilDue < 0) {
        const daysOverdue = Math.abs(daysUntilDue)
        notificationType = 'error'
        notificationTitle = 'Overdue Payment'
        messageText = `${payment.expense.title} is ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue`
      } else if (daysUntilDue === 3) {
        messageText = `${payment.expense.title} is due in 3 days`
      } else {
        continue // Skip other days
      }

      // ALWAYS create in-app notification
      await prisma.notification.create({
        data: {
          userId,
          title: notificationTitle,
          message: messageText,
          type: notificationType,
          actionUrl: '/expenses',
          metadata: JSON.stringify({
            paymentId: payment.id,
            expenseId: payment.expenseId,
            dueDate: payment.dueDate,
            amount: Number(payment.amount),
            isOverdue: daysUntilDue < 0,
            daysUntilDue,
          }),
        },
      })

      // Best-effort web push (no-op if push disabled / no subscriptions)
      await sendPushToUser(userId, {
        title: notificationTitle,
        body: messageText,
        url: '/expenses',
      })

      // ALWAYS send email
      const emailResult = await sendPaymentReminderEmail({
        email: user.email,
        userName: user.name || undefined,
        expenseTitle: payment.expense.title,
        amount: Number(payment.amount),
        currency: payment.expense.currency,
        dueDate: payment.dueDate,
        daysUntilDue,
      })

      if (emailResult.success) {
        sentCount++
      } else {
        errors.push(`Failed to send email: ${emailResult.error}`)
      }
    }

    return {
      success: true,
      sentCount,
      errors,
    }
  } catch (error) {
    console.error('Error in sendUserPaymentNotifications:', error)
    return {
      success: false,
      sentCount,
      errors: [
        ...errors,
        error instanceof Error ? error.message : 'Unknown error occurred',
      ],
    }
  }
}

/**
 * Debt milestone (Phase 2): the final installment closed the debt.
 * In-app + best-effort push. Called from recordDebtPayment.
 */
export async function notifyDebtPaidOff(
  userId: string,
  debtName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const t = await getServerTranslator('DebtNotifications')
    const title = t('paidOffTitle')
    const message = t('paidOffMessage', { debt: debtName })

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'success',
        actionUrl: '/debts',
        metadata: JSON.stringify({ kind: 'debt-paid-off', debtName }),
      },
    })

    await sendPushToUser(userId, { title, body: message, url: '/debts' })

    return { success: true }
  } catch (error) {
    console.error('Error in notifyDebtPaidOff:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Debt installment reminders (Phase 2), for the daily cron.
 * Triggers, deduped once per installment per event via a metadata marker:
 * - upcoming: due within the user's notifyBeforeDays window (incl. today)
 * - overdue: past due and unpaid
 * Sends in-app + email + best-effort push. Archived / paid-off debts skipped.
 */
export async function sendUpcomingDebtNotifications(): Promise<NotificationResult> {
  const errors: string[] = []
  let sentCount = 0

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        notificationPreferences: { select: { notifyBeforeDays: true } },
      },
    })

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const t = await getServerTranslator('DebtNotifications')

    for (const user of users) {
      try {
        const notifyBeforeDays =
          user.notificationPreferences?.notifyBeforeDays ?? 3
        const windowEnd = new Date(now)
        windowEnd.setDate(now.getDate() + notifyBeforeDays)
        windowEnd.setHours(23, 59, 59, 999)

        const items = await prisma.debtScheduleItem.findMany({
          where: {
            paid: false,
            debt: { userId: user.id, status: 'ACTIVE' },
            dueDate: { lte: windowEnd },
          },
          include: {
            debt: { select: { id: true, name: true, currency: true } },
          },
          orderBy: { dueDate: 'asc' },
        })

        for (const item of items) {
          const due = new Date(item.dueDate)
          due.setHours(0, 0, 0, 0)
          const daysUntilDue = Math.ceil(
            (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
          const kind = daysUntilDue < 0 ? 'overdue' : 'upcoming'
          const debtKey = `debt:${item.id}:${kind}`

          // Dedup: at most one notification per installment per event
          const existing = await prisma.notification.findFirst({
            where: {
              userId: user.id,
              metadata: { contains: `"debtKey":"${debtKey}"` },
            },
            select: { id: true },
          })
          if (existing) continue

          const amount = Number(item.payment)
          const title =
            kind === 'overdue' ? t('overdueTitle') : t('upcomingTitle')
          const message =
            kind === 'overdue'
              ? t('overdueMessage', {
                  debt: item.debt.name,
                  amount: amount.toFixed(2),
                  currency: item.debt.currency,
                })
              : daysUntilDue === 0
                ? t('dueTodayMessage', {
                    debt: item.debt.name,
                    amount: amount.toFixed(2),
                    currency: item.debt.currency,
                  })
                : t('upcomingMessage', {
                    debt: item.debt.name,
                    amount: amount.toFixed(2),
                    currency: item.debt.currency,
                    days: daysUntilDue,
                  })

          await prisma.notification.create({
            data: {
              userId: user.id,
              title,
              message,
              type: kind === 'overdue' ? 'error' : 'payment',
              actionUrl: `/debts/${item.debt.id}`,
              metadata: JSON.stringify({
                kind: 'debt',
                debtKey,
                debtId: item.debt.id,
                scheduleItemId: item.id,
                dueDate: item.dueDate,
                amount,
                daysUntilDue,
              }),
            },
          })

          await sendPushToUser(user.id, {
            title,
            body: message,
            url: `/debts/${item.debt.id}`,
          })

          const emailResult = await sendPaymentReminderEmail({
            email: user.email,
            userName: user.name || undefined,
            expenseTitle: item.debt.name,
            amount,
            currency: item.debt.currency,
            dueDate: new Date(item.dueDate),
            daysUntilDue,
          })

          if (emailResult.success) {
            sentCount++
          } else {
            errors.push(
              `Failed to send debt email to ${user.email} for ${item.debt.name}: ${emailResult.error}`
            )
          }
        }
      } catch (error) {
        errors.push(
          `Error processing debt notifications for user ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    return { success: true, sentCount, errors }
  } catch (error) {
    console.error('Error in sendUpcomingDebtNotifications:', error)
    return {
      success: false,
      sentCount,
      errors: [
        ...errors,
        error instanceof Error ? error.message : 'Unknown error occurred',
      ],
    }
  }
}

/**
 * Goal milestone (Phase 3): a non-reserve goal reached its target.
 * In-app + email + best-effort push. Called from contributeToGoal.
 */
export async function notifyGoalAchieved(
  userId: string,
  goalName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const t = await getServerTranslator('GoalNotifications')
    const title = t('achievedTitle')
    const message = t('achievedMessage', { goal: goalName })

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'success',
        actionUrl: '/goals',
        metadata: JSON.stringify({ kind: 'goal-achieved', goalName }),
      },
    })

    await sendPushToUser(userId, { title, body: message, url: '/goals' })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    })
    if (user) {
      await sendGoalMilestoneEmail({
        email: user.email,
        userName: user.name || undefined,
        subject: title,
        heading: title,
        body: message,
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Error in notifyGoalAchieved:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Reserve milestone (Phase 3): the emergency fund filled its current stage.
 * Stage 1 → also nudges toward the 3-month stage. In-app + email + push.
 */
export async function notifyReserveStageReached(
  userId: string,
  stage: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const t = await getServerTranslator('GoalNotifications')
    const title = t('reserveStageTitle', { stage })
    const message =
      stage === 1 ? t('reserveStage1Message') : t('reserveStage3Message')

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'success',
        actionUrl: '/goals',
        metadata: JSON.stringify({ kind: 'reserve-stage', stage }),
      },
    })

    await sendPushToUser(userId, { title, body: message, url: '/goals' })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    })
    if (user) {
      await sendGoalMilestoneEmail({
        email: user.email,
        userName: user.name || undefined,
        subject: title,
        heading: title,
        body: message,
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Error in notifyReserveStageReached:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Reserve withdrawal (Phase 3): money taken out of the emergency fund, with the
 * mandatory reason recorded. In-app only (a deliberate, logged action).
 */
export async function notifyReserveWithdrawal(
  userId: string,
  input: { goalName: string; amount: number; currency: string; reason: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const t = await getServerTranslator('GoalNotifications')
    const title = t('withdrawTitle')
    const message = t('withdrawMessage', {
      goal: input.goalName,
      amount: input.amount.toFixed(2),
      currency: input.currency,
      reason: input.reason,
    })

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'warning',
        actionUrl: '/goals',
        metadata: JSON.stringify({
          kind: 'goal-withdrawal',
          reason: input.reason,
          amount: input.amount,
        }),
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Error in notifyReserveWithdrawal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Reserve target changed (Phase 3): the auto-computed target moved by >±10%.
 * In-app only, with a short explanation. Called from recalcReserveTargetForUser.
 */
export async function notifyReserveTargetChanged(
  userId: string,
  input: { oldTarget: number; newTarget: number; currency: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const t = await getServerTranslator('GoalNotifications')
    const increased = input.newTarget > input.oldTarget
    const title = t('reserveTargetTitle')
    const message = t(
      increased ? 'reserveTargetUpMessage' : 'reserveTargetDownMessage',
      {
        oldTarget: input.oldTarget.toFixed(2),
        newTarget: input.newTarget.toFixed(2),
        currency: input.currency,
      }
    )

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'info',
        actionUrl: '/goals',
        metadata: JSON.stringify({
          kind: 'reserve-target-changed',
          oldTarget: input.oldTarget,
          newTarget: input.newTarget,
        }),
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Error in notifyReserveTargetChanged:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Category soft-limit warning (Phase 1).
 * Fires when the current-month spend crosses 80% or 100% of the category's
 * monthly limit. Max ONE notification per threshold per category per month —
 * dedup state lives in Notification.metadata (limitKey marker).
 */
export async function notifyCategoryLimitThreshold(
  userId: string,
  category: { id: string; name: string },
  status: { spent: number; limit: number; ratio: number },
  currency: string
): Promise<{ success: boolean; notified: boolean; error?: string }> {
  try {
    const threshold = status.ratio > 1 ? 100 : status.ratio >= 0.8 ? 80 : null
    if (threshold === null) {
      return { success: true, notified: false }
    }

    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const limitKey = `${category.id}:${threshold}:${monthKey}`

    // Dedup: at most one notification per threshold per category per month
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        metadata: { contains: `"limitKey":"${limitKey}"` },
      },
      select: { id: true },
    })

    if (existing) {
      return { success: true, notified: false }
    }

    const percent = Math.round(status.ratio * 100)
    const isOver = threshold === 100
    const t = await getServerTranslator('CategoryLimitAlert')
    const title = isOver
      ? t('titleOver', { category: category.name })
      : t('titleWarn', { category: category.name })
    const message = t('message', {
      category: category.name,
      spent: status.spent.toFixed(2),
      limit: status.limit.toFixed(2),
      currency,
      percent,
    })

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: isOver ? 'error' : 'warning',
        actionUrl: '/expenses?tab=categories',
        metadata: JSON.stringify({
          kind: 'category-limit',
          limitKey,
          categoryId: category.id,
          threshold,
          spent: status.spent,
          limit: status.limit,
        }),
      },
    })

    // Best-effort push; failures must not block the expense write
    await sendPushToUser(userId, {
      title,
      body: message,
      url: '/expenses?tab=categories',
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    })

    if (user) {
      await sendCategoryLimitEmail({
        email: user.email,
        userName: user.name || undefined,
        categoryName: category.name,
        spent: status.spent,
        limit: status.limit,
        currency,
        percent,
      })
    }

    return { success: true, notified: true }
  } catch (error) {
    console.error('Error in notifyCategoryLimitThreshold:', error)
    return {
      success: false,
      notified: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
