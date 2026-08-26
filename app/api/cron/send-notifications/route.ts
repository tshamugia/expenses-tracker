import { NextRequest, NextResponse } from 'next/server'
import { accrueStableIncomeForAllUsers } from '@/lib/services/income-accrual'
import {
  sendUpcomingDebtNotifications,
  sendUpcomingPaymentNotifications,
} from '@/lib/services/notification-service'
import { recalcAllReserveTargets } from '@/lib/services/reserve-target-service'
import {
  generateMonthlyPlansForAllUsers,
  sendMonthCloseReminders,
} from '@/lib/services/plan-cron'

/**
 * Cron endpoint to send payment reminder notifications
 *
 * This endpoint should be called by a cron service (like Vercel Cron, GitHub Actions, or cron-job.org)
 *
 * Security:
 * - In production, add authentication via CRON_SECRET environment variable
 * - Example: Authorization: Bearer YOUR_CRON_SECRET
 *
 * Schedule recommendations:
 * - Daily at 9:00 AM user's timezone (or UTC for simplicity)
 * - Example cron: 0 9 * * * (every day at 9:00 AM)
 */
export async function GET(request: NextRequest) {
  try {
    // Check for authorization in production
    if (process.env.NODE_ENV === 'production') {
      const authHeader = request.headers.get('authorization')
      const token = authHeader?.replace('Bearer ', '')

      if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    console.log('Starting scheduled payment notification job...')
    const startTime = Date.now()

    // Credit stable income that came due, for users who have not opened the
    // app; failures must not block the reminder emails below
    let accruedCount = 0
    try {
      accruedCount = await accrueStableIncomeForAllUsers()
      console.log(`Accrued ${accruedCount} stable income transactions`)
    } catch (error) {
      console.error('Error accruing stable income:', error)
    }

    const result = await sendUpcomingPaymentNotifications()

    // Debt installment reminders (Phase 2): upcoming + overdue, deduped per event
    const debtResult = await sendUpcomingDebtNotifications()

    // Reserve target recompute (Phase 3): once a month, on the 1st. Notifies
    // affected users on a >±10% move; failures must not block the emails above.
    let reserveRecalcCount = 0
    let plansGenerated = 0
    if (new Date().getDate() === 1) {
      try {
        reserveRecalcCount = await recalcAllReserveTargets()
        console.log(`Recomputed ${reserveRecalcCount} reserve targets`)
      } catch (error) {
        console.error('Error recomputing reserve targets:', error)
      }
      // Monthly plan generation + "plan ready" digest (Phase 4, §7 / ს1)
      try {
        plansGenerated = await generateMonthlyPlansForAllUsers()
        console.log(`Generated ${plansGenerated} monthly plans`)
      } catch (error) {
        console.error('Error generating monthly plans:', error)
      }
    }

    // Month-close reminders in the last days of the month (Phase 4, §7 / ს4)
    let closeReminders = 0
    try {
      closeReminders = await sendMonthCloseReminders()
      if (closeReminders > 0) console.log(`Sent ${closeReminders} close reminders`)
    } catch (error) {
      console.error('Error sending close reminders:', error)
    }

    const duration = Date.now() - startTime
    const sentCount = result.sentCount + debtResult.sentCount
    const errors = [...result.errors, ...debtResult.errors]
    console.log(`Payment notification job completed in ${duration}ms`)
    console.log(`Sent: ${sentCount} emails (${debtResult.sentCount} debt)`)
    if (errors.length > 0) {
      console.log(`Errors: ${errors.length}`)
      errors.forEach((error) => console.error(`  - ${error}`))
    }

    return NextResponse.json({
      success: result.success && debtResult.success,
      accruedCount,
      sentCount,
      reserveRecalcCount,
      plansGenerated,
      closeReminders,
      errorCount: errors.length,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error in cron job:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

/**
 * Allow POST requests as well for manual triggers
 */
export async function POST(request: NextRequest) {
  return GET(request)
}
