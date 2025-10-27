'use server'

/**
 * Notification Service
 * Handles checking for upcoming payments and sending email reminders
 */

import prisma from '@/lib/db/prisma'
import { sendPaymentReminderEmail } from './email'

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
