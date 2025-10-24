import { Suspense } from 'react'
import { Bell } from 'lucide-react'
import { NotificationList } from '@/components/notifications/notification-list'
import { getUserNotifications, getNotificationStats } from '@/lib/actions/notification-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

export const metadata = {
  title: 'Notifications | ExtraTracker',
  description: 'View and manage your notifications',
}

export const dynamic = 'force-dynamic'

async function NotificationsContent() {
  const [notificationsResult, statsResult] = await Promise.all([
    getUserNotifications(),
    getNotificationStats(),
  ])

  if (!notificationsResult.success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{notificationsResult.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!statsResult.success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{statsResult.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{statsResult.data.total}</p>
              </div>
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold text-primary">
                  {statsResult.data.unread}
                </p>
              </div>
              <Badge variant="destructive" className="h-8 px-3 text-lg">
                {statsResult.data.unread}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Read</p>
                <p className="text-2xl font-bold">
                  {statsResult.data.total - statsResult.data.unread}
                </p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <span className="text-green-600 dark:text-green-400 text-sm font-bold">
                  ✓
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications List */}
      <NotificationList notifications={notificationsResult.data} />
    </>
  )
}

function NotificationsSkeleton() {
  return (
    <>
      {/* Stats Skeleton */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* List Skeleton */}
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </>
  )
}

export default function NotificationsPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated with your expenses and payments
          </p>
        </div>
      </div>

      {/* Content */}
      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsContent />
      </Suspense>
    </div>
  )
}
