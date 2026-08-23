import { Suspense } from 'react'
import { Settings } from 'lucide-react'
import { NotificationSettings } from '@/components/settings/notification-settings'
import { ThemeSettings } from '@/components/settings/theme-settings'
import { CurrencySettings } from '@/components/settings/currency-settings'
import { LanguageSettings } from '@/components/settings/language-settings'
import { SubscriptionPlans } from '@/components/settings/subscription-plans'
import { getUserSettings, getSubscriptionPlans } from '@/lib/actions/settings-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = {
  title: 'Settings | ExtraTracker',
  description: 'Manage your application settings and preferences',
}

export const dynamic = 'force-dynamic'

async function SettingsContent() {
  const [settingsResult, plansResult] = await Promise.all([
    getUserSettings(),
    getSubscriptionPlans(),
  ])

  if (!settingsResult.success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{settingsResult.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!plansResult.success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{plansResult.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      {/* Notifications & Theme Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <NotificationSettings settings={settingsResult.data} />
        <ThemeSettings settings={settingsResult.data} />
      </div>

      {/* Currency & Language Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CurrencySettings settings={settingsResult.data} />
        <LanguageSettings />
      </div>

      {/* Subscription Plans */}
      <SubscriptionPlans
        settings={settingsResult.data}
        plans={plansResult.data}
      />
    </>
  )
}

function SettingsSkeleton() {
  return (
    <>
      {/* Notifications & Theme Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscription Plans Skeleton */}
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="grid gap-6 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
          <Settings className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
          <p className="text-muted-foreground">
            Manage your application preferences and subscription
          </p>
        </div>
      </div>

      {/* Content */}
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
