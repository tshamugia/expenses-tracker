'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CreditCard,
  Receipt,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  markNotificationAsRead,
  deleteNotification,
} from '@/lib/actions/notification-actions'
import { toast } from 'sonner'
import type { Notification, NotificationType } from '@/types/notification-types'

interface NotificationItemProps {
  notification: Notification
}

const notificationIcons: Record<NotificationType, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  payment: CreditCard,
  expense: Receipt,
}

const notificationColors: Record<
  NotificationType,
  { bg: string; icon: string; border: string }
> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'text-blue-500',
    border: 'border-blue-200 dark:border-blue-800',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: 'text-green-500',
    border: 'border-green-200 dark:border-green-800',
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    icon: 'text-yellow-500',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    icon: 'text-red-500',
    border: 'border-red-200 dark:border-red-800',
  },
  payment: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-500',
    border: 'border-purple-200 dark:border-purple-800',
  },
  expense: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    icon: 'text-orange-500',
    border: 'border-orange-200 dark:border-orange-800',
  },
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const Icon = notificationIcons[notification.type as NotificationType]
  const colors = notificationColors[notification.type as NotificationType]

  const handleClick = async () => {
    if (!notification.isRead) {
      await markNotificationAsRead(notification.id)
      router.refresh()
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDeleting(true)

    try {
      const result = await deleteNotification(notification.id)
      if (result.success) {
        toast.success('Notification deleted')
        router.refresh()
      } else {
        toast.error(result.error)
        setIsDeleting(false)
      }
    } catch (error) {
      toast.error('Failed to delete notification')
      setIsDeleting(false)
    }
  }

  const content = (
    <Card
      className={cn(
        'relative overflow-hidden transition-all hover:shadow-md',
        !notification.isRead && 'border-l-4',
        !notification.isRead && colors.border,
        notification.isRead && 'opacity-60',
        isDeleting && 'opacity-50'
      )}
      onClick={handleClick}
    >
      <div className="flex gap-4 p-4">
        {/* Icon */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            colors.bg
          )}
        >
          <Icon className={cn('h-5 w-5', colors.icon)} />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-tight">{notification.title}</p>
            {!notification.isRead && (
              <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">{notification.message}</p>
          <div className="flex items-center gap-4 pt-1">
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
              })}
            </p>
            {notification.actionUrl && (
              <span className="text-xs text-primary flex items-center gap-1">
                View details <ExternalLink className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )

  if (notification.actionUrl) {
    return (
      <Link href={notification.actionUrl} className="block">
        {content}
      </Link>
    )
  }

  return <div className="cursor-pointer">{content}</div>
}
