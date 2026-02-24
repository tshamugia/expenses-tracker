import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { PaginatedResponse, NotificationStats } from '@extracker/types'

interface NotificationItem {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  actionUrl: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

/**
 * Fetch paginated notifications for the authenticated user.
 */
export function useNotifications(page = 1) {
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const { data, error } = await api.notifications.get({
        query: { page, pageSize: 20 },
      })
      if (error) throw error
      const response = data as unknown as {
        success: boolean
        data: PaginatedResponse<NotificationItem>
      }
      return response.data
    },
  })
}

/**
 * Fetch notification stats (total + unread count).
 * Polls every 60 seconds when the app is in the foreground.
 */
export function useNotificationStats() {
  return useQuery({
    queryKey: ['notification-stats'],
    queryFn: async () => {
      const { data, error } = await api.notifications.stats.get()
      if (error) throw error
      const response = data as unknown as {
        success: boolean
        data: NotificationStats
      }
      return response.data
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

/**
 * Mark a single notification as read.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.notifications({ id }).read.patch()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] })
    },
  })
}

/**
 * Mark all unread notifications as read.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.notifications['read-all'].post()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] })
    },
  })
}

/**
 * Delete a single notification.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.notifications({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] })
    },
  })
}

/**
 * Delete all read notifications.
 */
export function useDeleteReadNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await api.notifications.read.delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] })
    },
  })
}
