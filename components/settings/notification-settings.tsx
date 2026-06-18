'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail, Bell, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateUserSettings } from '@/lib/actions/settings-actions'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/actions/push-actions'
import { urlBase64ToUint8Array, serializeSubscription } from '@/lib/utils/push-helpers'
import type { UserSettings } from '@/types/settings-types'

interface NotificationSettingsProps {
  settings: UserSettings
}

export function NotificationSettings({ settings }: NotificationSettingsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(settings.emailEnabled)

  // Push notification state
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(settings.pushEnabled)
  const [isPushLoading, setIsPushLoading] = useState(false)

  useEffect(() => {
    setPushSupported(
      typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    )
  }, [])

  const handleToggle = async (enabled: boolean) => {
    setIsLoading(true)
    setEmailEnabled(enabled)

    try {
      const result = await updateUserSettings({
        emailEnabled: enabled,
      })

      if (result.success) {
        toast.success(
          enabled
            ? 'Email notifications enabled'
            : 'Email notifications disabled'
        )
        router.refresh()
      } else {
        toast.error(result.error)
        // Revert on error
        setEmailEnabled(!enabled)
      }
    } catch (error) {
      toast.error('Failed to update notification settings')
      console.error('Notification settings error:', error)
      // Revert on error
      setEmailEnabled(!enabled)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePushToggle = async (enabled: boolean) => {
    setIsPushLoading(true)
    try {
      if (enabled) {
        await enablePush()
      } else {
        await disablePush()
      }
    } catch (error) {
      console.error('Push settings error:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to update push notifications'
      )
      setPushEnabled(!enabled)
    } finally {
      setIsPushLoading(false)
    }
  }

  const enablePush = async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      throw new Error('Push notifications are not configured on the server')
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('Notification permission was denied')
    }

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }))

    const result = await subscribeToPush(serializeSubscription(subscription))
    if (!result.success) {
      throw new Error(result.error)
    }

    setPushEnabled(true)
    toast.success('Push notifications enabled')
    router.refresh()
  }

  const disablePush = async () => {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      await unsubscribeFromPush(subscription.endpoint)
      await subscription.unsubscribe()
    } else {
      // No browser subscription, but clear the server preference anyway.
      await unsubscribeFromPush('')
    }

    setPushEnabled(false)
    toast.success('Push notifications disabled')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Manage your email notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between space-x-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="email-notifications" className="text-base">
                Enable Email Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive email reminders for upcoming payments and expenses
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="email-notifications"
                checked={emailEnabled}
                onCheckedChange={handleToggle}
                disabled={isLoading}
              />
            </div>
          </div>

          {emailEnabled && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium mb-2">
                You will receive notifications for:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <span className="text-primary">•</span>
                  Upcoming payment due dates
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary">•</span>
                  Overdue expenses
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary">•</span>
                  Recurring payment reminders
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary">•</span>
                  Monthly expense summaries
                </li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Get payment reminders pushed to this device, even when the app is closed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between space-x-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="push-notifications" className="text-base">
                Enable Push Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                {pushSupported
                  ? 'Allow ExtraTracker to send push notifications to this browser'
                  : 'This browser does not support push notifications'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPushLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="push-notifications"
                checked={pushEnabled}
                onCheckedChange={handlePushToggle}
                disabled={isPushLoading || !pushSupported}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
