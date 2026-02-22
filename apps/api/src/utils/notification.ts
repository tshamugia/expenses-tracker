import { prisma } from '@extracker/db'
import { sendPaymentReminderEmail } from './email'

/**
 * Create instant notification when a new expense is added with past or today due date.
 * Creates in-app notification and sends email.
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
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
      return { success: true }
    }

    let notificationType: 'warning' | 'error' = 'warning'
    let notificationTitle = 'New Payment Due Today'
    let messageText = ''

    if (daysUntilDue < 0) {
      const daysOverdue = Math.abs(daysUntilDue)
      notificationType = 'error'
      notificationTitle = 'New Overdue Payment Added'
      messageText = `${expenseTitle} was due ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} ago`
    } else {
      messageText = `${expenseTitle} is due today`
    }

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

    const emailResult = await sendPaymentReminderEmail({
      email: user.email,
      userName: user.name || undefined,
      expenseTitle,
      amount,
      currency,
      dueDate,
      daysUntilDue,
    })

    if (!emailResult.success) {
      console.error(`Failed to send email for new overdue expense: ${emailResult.error}`)
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
