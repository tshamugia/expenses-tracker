import { useState, useCallback } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { Button, Text } from 'react-native-paper'
import { Stack, useRouter } from 'expo-router'
import { ScreenError, EmptyState } from '@/components'
import { NotificationListSkeleton } from '@/components/skeletons'
import { NotificationCard } from '@/components/notification-card'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteReadNotifications,
  useSnackbar,
} from '@/lib/hooks'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { hapticLight, hapticError } from '@/lib/utils/haptics'
import { useAppTheme } from '@/lib/theme/theme-context'
import { AnimatedListItem } from '@/components/animated-list-item'

export default function NotificationsScreen() {
  const router = useRouter()
  const { colors } = useAppTheme()
  const { showSnackbar } = useSnackbar()
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error, refetch } = useNotifications(page)
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const deleteOne = useDeleteNotification()
  const deleteRead = useDeleteReadNotifications()

  const notifications = data?.data ?? []
  const hasMore = data ? data.page < data.totalPages : false
  const hasReadNotifications = notifications.some((n) => n.isRead)

  const handleRefresh = useCallback(() => {
    setPage(1)
    refetch()
  }, [refetch])

  const handlePress = useCallback(
    (notification: (typeof notifications)[0]) => {
      if (!notification.isRead) {
        markRead.mutate(notification.id)
      }
      if (notification.actionUrl?.includes('/expense/')) {
        const expenseId = notification.actionUrl.split('/expense/').pop()
        if (expenseId) {
          router.push(`/expense/${expenseId}`)
        }
      }
    },
    [markRead, router],
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteOne.mutate(id, {
        onError: (err) => {
          hapticError()
          showSnackbar(getApiErrorMessage(err), 'error')
        },
      })
    },
    [deleteOne, showSnackbar],
  )

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        hapticLight()
        showSnackbar('All notifications marked as read', 'success')
      },
      onError: (err) => {
        hapticError()
        showSnackbar(getApiErrorMessage(err), 'error')
      },
    })
  }, [markAllRead, showSnackbar])

  const handleDeleteRead = useCallback(() => {
    deleteRead.mutate(undefined, {
      onSuccess: () => {
        hapticLight()
        showSnackbar('Read notifications deleted', 'success')
      },
      onError: (err) => {
        hapticError()
        showSnackbar(getApiErrorMessage(err), 'error')
      },
    })
  }, [deleteRead, showSnackbar])

  if (isLoading) return <NotificationListSkeleton />
  if (isError) {
    return (
      <ScreenError
        message={getApiErrorMessage(error)}
        onRetry={refetch}
      />
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackgroundSecondary }]}>
      <Stack.Screen
        options={{
          headerRight: () =>
            notifications.length > 0 ? (
              <Button
                mode="text"
                onPress={handleMarkAllRead}
                loading={markAllRead.isPending}
                textColor="#ffffff"
                compact
              >
                Mark All Read
              </Button>
            ) : null,
        }}
      />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index}>
            <NotificationCard
              notification={item}
              onPress={() => handlePress(item)}
              onDelete={() => handleDelete(item.id)}
            />
          </AnimatedListItem>
        )}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            colors={[colors.refreshTint]}
          />
        }
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell-off"
            title="No notifications"
            description="You're all caught up! Notifications will appear here."
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {hasMore && (
              <Button
                mode="outlined"
                onPress={() => setPage((p) => p + 1)}
                style={[styles.loadMoreButton, { borderColor: colors.brandPrimary }]}
                textColor={colors.brandPrimary}
              >
                Load More
              </Button>
            )}
            {hasReadNotifications && (
              <Button
                mode="outlined"
                onPress={handleDeleteRead}
                loading={deleteRead.isPending}
                style={[styles.deleteReadButton, { borderColor: colors.error }]}
                textColor={colors.error}
              >
                Delete All Read
              </Button>
            )}
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  loadMoreButton: {
    borderRadius: 12,
  },
  deleteReadButton: {
    borderRadius: 12,
  },
})
