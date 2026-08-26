import { getTranslations } from 'next-intl/server'
import { DashboardClient } from './dashboard-client'
import { getDashboardData } from '@/lib/actions/plan-actions'
import { getAuthUserId } from '@/lib/auth/get-session'
import { ensureEmergencyFund } from '@/lib/actions/goal-actions'

// Server Component — assembles the whole Phase-4 dashboard view model (Safe to
// spend, verdict, stability path, debts, goals, net position) in one action.
export default async function DashboardPage() {
  await getAuthUserId() // redirects to /login when unauthenticated
  await ensureEmergencyFund() // guarantee the reserve exists for the stability path

  const result = await getDashboardData()

  if (!result.success || !result.data) {
    const t = await getTranslations('Dashboard')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('title')} — {result.error ?? ''}
      </div>
    )
  }

  return <DashboardClient data={result.data} />
}
