import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { sendUserPaymentNotifications } from '@/lib/services/notification-service'

/**
 * Test endpoint to manually trigger payment notifications for the current user
 * Only works for authenticated users in development/testing
 */
export async function GET() {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - please login first' },
        { status: 401 }
      )
    }

    console.log(`Testing payment notifications for user: ${session.user.email}`)

    const result = await sendUserPaymentNotifications(session.user.id)

    return NextResponse.json({
      success: result.success,
      sentCount: result.sentCount,
      errors: result.errors,
      message:
        result.sentCount > 0
          ? `Successfully sent ${result.sentCount} notification email(s)`
          : 'No upcoming payments found within notification window',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error testing notifications:', error)
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
