'use server'

/**
 * Server Actions for Notifications
 * BUSINESS LOGIC LAYER
 * - Handle notification CRUD operations
 * - Mark notifications as read
 * - Get notification counts
 */

import { revalidatePath } from 'next/cache'
import { prisma } from '@extracker/db'
import { getAuthUserId } from '@/lib/auth/get-session'
import type {
  ActionResult,
  Notification,
  CreateNotificationInput,
  NotificationStats,
} from '@extracker/types'

/**
 * Helper function to get the current authenticated user ID
 */
async function getCurrentUserId(): Promise<string> {
  return await getAuthUserId()
}

/**
 * Get all notifications for the current user
 */
export async function getUserNotifications(
  limit?: number
): Promise<ActionResult<Notification[]>> {
  try {
    const userId = await getCurrentUserId()

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      ...(limit && { take: limit }),
    })

    return {
      success: true,
      data: notifications as Notification[],
    }
  } catch (error) {
    console.error('Error in getUserNotifications:', error)
    return {
      success: false,
      error: 'Failed to load notifications',
    }
  }
}

/**
 * Get a single notification by ID
 */
export async function getNotificationById(
  notificationId: string
): Promise<ActionResult<Notification>> {
  try {
    const userId = await getCurrentUserId()

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId, // Ensure user owns the notification
      },
    })

    if (!notification) {
      return {
        success: false,
        error: 'Notification not found',
      }
    }

    return {
      success: true,
      data: notification as Notification,
    }
  } catch (error) {
    console.error('Error in getNotificationById:', error)
    return {
      success: false,
      error: 'Failed to load notification',
    }
  }
}

/**
 * Get notification statistics (total and unread count)
 */
export async function getNotificationStats(): Promise<
  ActionResult<NotificationStats>
> {
  try {
    const userId = await getCurrentUserId()

    const [total, unread] = await Promise.all([
      prisma.notification.count({
        where: { userId },
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ])

    return {
      success: true,
      data: { total, unread },
    }
  } catch (error) {
    console.error('Error in getNotificationStats:', error)
    return {
      success: false,
      error: 'Failed to load notification stats',
    }
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<ActionResult<Notification>> {
  try {
    const userId = await getCurrentUserId()

    const notification = await prisma.notification.update({
      where: {
        id: notificationId,
        userId, // Ensure user owns the notification
      },
      data: {
        isRead: true,
      },
    })

    revalidatePath('/notifications')

    return {
      success: true,
      data: notification as Notification,
    }
  } catch (error) {
    console.error('Error in markNotificationAsRead:', error)
    return {
      success: false,
      error: 'Failed to mark notification as read',
    }
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const userId = await getCurrentUserId()

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    })

    revalidatePath('/notifications')

    return {
      success: true,
      data: { count: result.count },
    }
  } catch (error) {
    console.error('Error in markAllNotificationsAsRead:', error)
    return {
      success: false,
      error: 'Failed to mark all notifications as read',
    }
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(
  notificationId: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await getCurrentUserId()

    await prisma.notification.delete({
      where: {
        id: notificationId,
        userId, // Ensure user owns the notification
      },
    })

    revalidatePath('/notifications')

    return {
      success: true,
      data: { message: 'Notification deleted successfully' },
    }
  } catch (error) {
    console.error('Error in deleteNotification:', error)
    return {
      success: false,
      error: 'Failed to delete notification',
    }
  }
}

/**
 * Delete all read notifications
 */
export async function deleteAllReadNotifications(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const userId = await getCurrentUserId()

    const result = await prisma.notification.deleteMany({
      where: {
        userId,
        isRead: true,
      },
    })

    revalidatePath('/notifications')

    return {
      success: true,
      data: { count: result.count },
    }
  } catch (error) {
    console.error('Error in deleteAllReadNotifications:', error)
    return {
      success: false,
      error: 'Failed to delete read notifications',
    }
  }
}

/**
 * Create a notification (for testing/demo purposes)
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<ActionResult<Notification>> {
  try {
    const userId = await getCurrentUserId()

    const notification = await prisma.notification.create({
      data: {
        userId,
        title: input.title,
        message: input.message,
        type: input.type || 'info',
        actionUrl: input.actionUrl || null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    })

    revalidatePath('/notifications')

    return {
      success: true,
      data: notification as Notification,
    }
  } catch (error) {
    console.error('Error in createNotification:', error)
    return {
      success: false,
      error: 'Failed to create notification',
    }
  }
}
