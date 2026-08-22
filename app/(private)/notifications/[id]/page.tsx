import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import {
  ArrowLeft,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CreditCard,
  Receipt,
  Calendar,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { getNotificationById, markNotificationAsRead } from '@/lib/actions/notification-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { NotificationType } from '@/types/notification-types'

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
  { bg: string; icon: string; badge: string }
> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: 'text-green-500',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    icon: 'text-yellow-500',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    icon: 'text-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  },
  payment: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-500',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  },
  expense: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    icon: 'text-orange-500',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  },
}

interface NotificationDetailPageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

async function NotificationDetailContent({ id }: { id: string }) {
  const result = await getNotificationById(id)

  if (!result.success) {
    notFound()
  }

  const notification = result.data

  // Mark as read if it's unread
  if (!notification.isRead) {
    await markNotificationAsRead(notification.id)
  }

  const Icon = notificationIcons[notification.type as NotificationType]
  const colors = notificationColors[notification.type as NotificationType]

  // Parse metadata if it exists
  let metadata: any = null
  if (notification.metadata) {
    try {
      metadata = JSON.parse(notification.metadata)
    } catch (error) {
      console.error('Failed to parse metadata:', error)
    }
  }

  return (
    <>
      {/* Back Button */}
      <div className="mb-6">
        <Link href="/notifications">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Notifications
          </Button>
        </Link>
      </div>

      {/* Main Card */}
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                colors.bg
              )}
            >
              <Icon className={cn('h-6 w-6', colors.icon)} />
            </div>

            {/* Title and Badge */}
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <CardTitle className="text-2xl">{notification.title}</CardTitle>
                <Badge className={cn('capitalize', colors.badge)}>
                  {notification.type}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Message */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Message</h3>
            <p className="text-base leading-relaxed">{notification.message}</p>
          </div>

          {/* Timestamps */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm">
                  {format(new Date(notification.createdAt), 'PPpp')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <p className="text-sm">
                  {notification.isRead ? 'Read' : 'Unread'}
                </p>
                {notification.isRead && (
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(notification.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Metadata Details */}
          {metadata && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Additional Details
              </h3>
              <div className="space-y-3">
                {metadata.expenseId && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Expense ID</span>
                    <span className="text-sm font-mono">{metadata.expenseId}</span>
                  </div>
                )}
                {metadata.paymentId && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Payment ID</span>
                    <span className="text-sm font-mono">{metadata.paymentId}</span>
                  </div>
                )}
                {metadata.amount !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="text-sm font-semibold">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'GEL',
                      }).format(metadata.amount)}
                    </span>
                  </div>
                )}
                {metadata.dueDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Due Date</span>
                    <span className="text-sm">
                      {format(new Date(metadata.dueDate), 'PP')}
                    </span>
                  </div>
                )}
                {metadata.daysUntilDue !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Days Until Due</span>
                    <span
                      className={cn(
                        'text-sm font-medium',
                        metadata.daysUntilDue < 0
                          ? 'text-red-600 dark:text-red-400'
                          : metadata.daysUntilDue === 0
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-green-600 dark:text-green-400'
                      )}
                    >
                      {metadata.daysUntilDue < 0
                        ? `${Math.abs(metadata.daysUntilDue)} days overdue`
                        : metadata.daysUntilDue === 0
                        ? 'Due today'
                        : `${metadata.daysUntilDue} days`}
                    </span>
                  </div>
                )}
                {metadata.isOverdue && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="destructive">Overdue</Badge>
                  </div>
                )}
                {metadata.isNewExpense && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <Badge variant="secondary">New Expense</Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Button */}
          {notification.actionUrl && (
            <div className="border-t pt-6">
              <Link href={notification.actionUrl}>
                <Button className="w-full sm:w-auto" size="lg">
                  View Related Page
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function NotificationDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-10 w-48 mb-6" />
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-start gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-3/4" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default async function NotificationDetailPage({
  params,
}: NotificationDetailPageProps) {
  const { id } = await params

  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<NotificationDetailSkeleton />}>
        <NotificationDetailContent id={id} />
      </Suspense>
    </div>
  )
}
