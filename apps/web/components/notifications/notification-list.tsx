'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Trash2, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NotificationItem } from './notification-item'
import {
  markAllNotificationsAsRead,
  deleteAllReadNotifications,
} from '@/lib/actions/notification-actions'
import type { Notification, NotificationType } from '@extracker/types'

interface NotificationListProps {
  notifications: Notification[]
}

export function NotificationList({ notifications }: NotificationListProps) {
  const router = useRouter()
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [isDeletingRead, setIsDeletingRead] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | NotificationType>('all')

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true)
    try {
      const result = await markAllNotificationsAsRead()
      if (result.success) {
        toast.success(`${result.data.count} notifications marked as read`)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to mark notifications as read')
    } finally {
      setIsMarkingAllRead(false)
    }
  }

  const handleDeleteAllRead = async () => {
    setIsDeletingRead(true)
    try {
      const result = await deleteAllReadNotifications()
      if (result.success) {
        toast.success(`${result.data.count} notifications deleted`)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to delete notifications')
    } finally {
      setIsDeletingRead(false)
    }
  }

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !notification.isRead
    return notification.type === filter
  })

  const unreadCount = notifications.filter((n) => !n.isRead).length
  const readCount = notifications.filter((n) => n.isRead).length

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter notifications" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({notifications.length})</SelectItem>
                <SelectItem value="unread">Unread ({unreadCount})</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isMarkingAllRead || unreadCount === 0}
            >
              <Check className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAllRead}
              disabled={isDeletingRead || readCount === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Read
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      {filteredNotifications.length > 0 ? (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm text-muted-foreground">
                {filter === 'unread'
                  ? "You're all caught up!"
                  : filter === 'all'
                  ? 'No notifications yet'
                  : `No ${filter} notifications`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
