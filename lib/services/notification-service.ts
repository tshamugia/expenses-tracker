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
 */
export async function sendUpcomingPaymentNotifications(): Promise<NotificationResult> {
  const errors: string[] = []
  let sentCount = 0

  try {
    // Get all users with email notifications enabled
    const usersWithNotifications = await prisma.notificationPreference.findMany({
      where: {
        emailEnabled: true,
      },
      select: {
        userId: true,
        notifyBeforeDays: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    })

    console.log(`Found ${usersWithNotifications.length} users with email notifications enabled`)

    // Process each user
    for (const userPref of usersWithNotifications) {
      try {
        // Calculate the notification window
        const now = new Date()
        const notifyBeforeDate = new Date()
        notifyBeforeDate.setDate(now.getDate() + userPref.notifyBeforeDays)
        notifyBeforeDate.setHours(23, 59, 59, 999) // End of the notification day

        // Find unpaid payments within the notification window
        const upcomingPayments = await prisma.payment.findMany({
          where: {
            expense: {
              userId: userPref.userId,
            },
            paid: false,
            dueDate: {
              gte: now,
              lte: notifyBeforeDate,
            },
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

        console.log(`User ${userPref.user.email}: Found ${upcomingPayments.length} upcoming payments`)

        // Send email for each upcoming payment
        for (const payment of upcomingPayments) {
          const daysUntilDue = Math.ceil(
            (payment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )

          // Skip if snoozed
          if (payment.snoozedUntil && payment.snoozedUntil > now) {
            console.log(`  Skipping snoozed payment: ${payment.expense.title}`)
            continue
          }

          console.log(`  Sending reminder for: ${payment.expense.title} (${daysUntilDue} days)`)

          const emailResult = await sendPaymentReminderEmail({
            email: userPref.user.email,
            userName: userPref.user.name || undefined,
            expenseTitle: payment.expense.title,
            amount: Number(payment.amount),
            currency: payment.expense.currency,
            dueDate: payment.dueDate,
            daysUntilDue,
          })

          if (emailResult.success) {
            sentCount++

            // Create in-app notification
            await prisma.notification.create({
              data: {
                userId: userPref.userId,
                title: 'Payment Reminder',
                message: `${payment.expense.title} is due ${daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`,
                type: 'payment',
                actionUrl: '/expenses',
                metadata: JSON.stringify({
                  paymentId: payment.id,
                  expenseId: payment.expenseId,
                  dueDate: payment.dueDate,
                  amount: Number(payment.amount),
                }),
              },
            })

            console.log(`  ✓ Email sent successfully`)
          } else {
            const errorMsg = `Failed to send email to ${userPref.user.email} for ${payment.expense.title}: ${emailResult.error}`
            errors.push(errorMsg)
            console.error(`  ✗ ${errorMsg}`)
          }
        }
      } catch (error) {
        const errorMsg = `Error processing notifications for user ${userPref.user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
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
 * Manual trigger for testing - checks and sends notifications for a specific user
 */
export async function sendUserPaymentNotifications(
  userId: string
): Promise<NotificationResult> {
  const errors: string[] = []
  let sentCount = 0

  try {
    // Get user with notification preferences
    const userPref = await prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        notifyBeforeDays: true,
        emailEnabled: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    })

    if (!userPref) {
      return {
        success: false,
        sentCount: 0,
        errors: ['User notification preferences not found'],
      }
    }

    if (!userPref.emailEnabled) {
      return {
        success: false,
        sentCount: 0,
        errors: ['Email notifications are disabled for this user'],
      }
    }

    // Calculate the notification window
    const now = new Date()
    const notifyBeforeDate = new Date()
    notifyBeforeDate.setDate(now.getDate() + userPref.notifyBeforeDays)
    notifyBeforeDate.setHours(23, 59, 59, 999)

    // Find unpaid payments within the notification window
    const upcomingPayments = await prisma.payment.findMany({
      where: {
        expense: {
          userId,
        },
        paid: false,
        dueDate: {
          gte: now,
          lte: notifyBeforeDate,
        },
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

    // Send email for each upcoming payment
    for (const payment of upcomingPayments) {
      const daysUntilDue = Math.ceil(
        (payment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Skip if snoozed
      if (payment.snoozedUntil && payment.snoozedUntil > now) {
        continue
      }

      const emailResult = await sendPaymentReminderEmail({
        email: userPref.user.email,
        userName: userPref.user.name || undefined,
        expenseTitle: payment.expense.title,
        amount: Number(payment.amount),
        currency: payment.expense.currency,
        dueDate: payment.dueDate,
        daysUntilDue,
      })

      if (emailResult.success) {
        sentCount++

        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId,
            title: 'Payment Reminder',
            message: `${payment.expense.title} is due ${daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`,
            type: 'payment',
            actionUrl: '/expenses',
            metadata: JSON.stringify({
              paymentId: payment.id,
              expenseId: payment.expenseId,
              dueDate: payment.dueDate,
              amount: Number(payment.amount),
            }),
          },
        })
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
