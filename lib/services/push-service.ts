'use server'

/**
 * Web Push Service
 * Sends browser push notifications to a user's subscribed devices.
 *
 * Best-effort, like the email service: if VAPID keys are missing or the user
 * has push disabled / no subscriptions, this is a no-op and never throws into
 * the caller. Expired subscriptions (404/410) are pruned automatically.
 */

import webpush from 'web-push'
import prisma from '@/lib/db/prisma'

let vapidConfigured = false

/**
 * Configure web-push with VAPID details once. Returns false if keys are absent.
 */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@extracker.app'

  if (!publicKey || !privateKey) {
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/**
 * Send a push notification to all of a user's subscribed devices.
 *
 * Respects the user's `pushEnabled` preference. Failures are logged but never
 * thrown, so callers (e.g. the notification service) are not disrupted.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ success: boolean; sentCount: number }> {
  try {
    if (!ensureVapidConfigured()) {
      console.log('Push skipped: VAPID keys not configured')
      return { success: false, sentCount: 0 }
    }

    // Respect the user's push preference.
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
      select: { pushEnabled: true },
    })
    if (!prefs?.pushEnabled) {
      return { success: false, sentCount: 0 }
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    })
    if (subscriptions.length === 0) {
      return { success: false, sentCount: 0 }
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/dashboard',
      tag: payload.tag,
    })

    let sentCount = 0
    const expiredEndpoints: string[] = []

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notificationPayload
          )
          sentCount++
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          // 404 Not Found / 410 Gone => subscription is dead, prune it.
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.push(sub.endpoint)
          } else {
            console.error(`Push send failed for ${sub.endpoint}:`, error)
          }
        }
      })
    )

    if (expiredEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: expiredEndpoints } },
      })
      console.log(`Pruned ${expiredEndpoints.length} expired push subscription(s)`)
    }

    return { success: sentCount > 0, sentCount }
  } catch (error) {
    console.error('Error in sendPushToUser:', error)
    return { success: false, sentCount: 0 }
  }
}
