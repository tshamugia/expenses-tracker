import { getDashboardData } from '@/lib/actions/expense-actions'
import { getCurrencyRates } from '@/lib/actions/currency-actions'
import { getUserSettings } from '@/lib/actions/settings-actions'
import { DashboardClient } from './dashboard-client'
import { getAuthUserId } from '@/lib/auth/get-session'

export default async function DashboardPage() {
  // Get authenticated user ID
  const userId = await getAuthUserId()

  // Call Server Actions (Business Logic Layer)
  const [dashboardData, currencyRates, userSettings] = await Promise.all([
    getDashboardData(userId),
    getCurrencyRates(),
    getUserSettings()
  ])

  return (
    <DashboardClient
      dashboardData={dashboardData}
      userId={userId}
      currencyRates={currencyRates.success && currencyRates.data ? currencyRates.data : null}
      defaultCurrency={userSettings.success ? userSettings.data.defaultCurrency : 'GEL'}
    />
  )
}
