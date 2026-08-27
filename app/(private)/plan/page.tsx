import { getTranslations } from 'next-intl/server'
import { PlanClient } from '@/components/plan/plan-client'
import { getActivePlan } from '@/lib/actions/plan-actions'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component — loads the current month's plan (draft/confirmed/closed) with
// its live facts. When none exists the client shows the one-tap generate CTA.
export default async function PlanPage() {
  await getAuthUserId() // redirects to /login when unauthenticated
  const result = await getActivePlan()

  if (!result.success) {
    const t = await getTranslations('Plan')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('loadFailed', { error: result.error ?? '' })}
      </div>
    )
  }

  return <PlanClient initialPlan={result.data ?? null} />
}
