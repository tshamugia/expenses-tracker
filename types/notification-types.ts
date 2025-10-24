/**
 * Notification Domain Type Definitions
 */

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'payment' | 'expense'

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: NotificationType
  isRead: boolean
  actionUrl: string | null
  metadata: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateNotificationInput {
  title: string
  message: string
  type?: NotificationType
  actionUrl?: string
  metadata?: Record<string, any>
}

export interface NotificationStats {
  total: number
  unread: number
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
