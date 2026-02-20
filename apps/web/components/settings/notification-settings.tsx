'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateUserSettings } from '@/lib/actions/settings-actions'
import type { UserSettings } from '@extracker/types'

interface NotificationSettingsProps {
  settings: UserSettings
}

export function NotificationSettings({ settings }: NotificationSettingsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(settings.emailEnabled)

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

  return (
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
  )
}
