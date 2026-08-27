import { getTranslations } from 'next-intl/server'
import { GoalsClient } from '@/components/goals/goals-client'
import { getGoals } from '@/lib/actions/goal-actions'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component — fetches the goals overview (which also ensures the
// emergency fund exists on first load) via the business logic layer.
export default async function GoalsPage() {
  await getAuthUserId() // redirects to /login when unauthenticated
  const result = await getGoals()

  if (!result.success || !result.data) {
    const t = await getTranslations('Goals')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('loadFailed', { error: result.error ?? '' })}
      </div>
    )
  }

  return <GoalsClient overview={result.data} />
}
