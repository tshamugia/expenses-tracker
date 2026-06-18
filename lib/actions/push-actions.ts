'use server'

/**
 * Server Actions for Web Push subscription management.
 * Called from the client when a user enables/disables push notifications.
 */

import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import type { ActionResult } from '@/types/settings-types'

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Save (upsert) a browser push subscription for the current user and enable
 * the push preference. Idempotent on the unique `endpoint`.
 */
export async function subscribeToPush(
  input: PushSubscriptionInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!input.endpoint || !input.p256dh || !input.auth) {
      return { success: false, error: 'Invalid subscription' }
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: { userId, p256dh: input.p256dh, auth: input.auth },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
    })

    // Enable the push preference (create prefs row if missing).
    await prisma.notificationPreference.upsert({
      where: { userId },
      update: { pushEnabled: true },
      create: { userId, pushEnabled: true },
    })

    return { success: true, data: { id: subscription.id } }
  } catch (error) {
    console.error('Error in subscribeToPush:', error)
    return { success: false, error: 'Failed to save push subscription' }
  }
}

/**
 * Remove a browser push subscription. Disables the push preference when the
 * user has no remaining subscriptions.
 */
export async function unsubscribeFromPush(
  endpoint: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    })

    const remaining = await prisma.pushSubscription.count({ where: { userId } })
    if (remaining === 0) {
      await prisma.notificationPreference.updateMany({
        where: { userId },
        data: { pushEnabled: false },
      })
    }

    return { success: true, data: { removed: true } }
  } catch (error) {
    console.error('Error in unsubscribeFromPush:', error)
    return { success: false, error: 'Failed to remove push subscription' }
  }
}
