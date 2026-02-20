import { NextRequest, NextResponse } from 'next/server'
import { sendUpcomingPaymentNotifications } from '@/lib/services/notification-service'

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

    const result = await sendUpcomingPaymentNotifications()

    const duration = Date.now() - startTime
    console.log(`Payment notification job completed in ${duration}ms`)
    console.log(`Sent: ${result.sentCount} emails`)
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`)
      result.errors.forEach((error) => console.error(`  - ${error}`))
    }

    return NextResponse.json({
      success: result.success,
      sentCount: result.sentCount,
      errorCount: result.errors.length,
      errors: result.errors,
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
