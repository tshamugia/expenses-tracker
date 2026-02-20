'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getNotificationStats } from '@/lib/actions/notification-actions'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const result = await getNotificationStats()
        if (result.success) {
          setUnreadCount(result.data.unread)
        }
      } catch (error) {
        console.error('Failed to load notification stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()

    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      asChild
    >
      <Link href="/notifications">
        <Bell className="h-5 w-5" />
        {!isLoading && unreadCount > 0 && (
          <>
            {/* Animated ping effect */}
            <span className="absolute right-1 top-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {/* Badge with count */}
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          </>
        )}
        <span className="sr-only">
          Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
        </span>
      </Link>
    </Button>
  )
}
