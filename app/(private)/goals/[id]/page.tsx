import { getTranslations } from 'next-intl/server'
import { GoalDetailClient } from '@/components/goals/goal-detail-client'
import { getGoalDetail } from '@/lib/actions/goal-actions'
import { getAuthUserId } from '@/lib/auth/get-session'

interface GoalDetailPageProps {
  params: Promise<{ id: string }>
}

// Server Component — fetches one goal's detail via the business logic layer
export default async function GoalDetailPage({ params }: GoalDetailPageProps) {
  await getAuthUserId() // redirects to /login when unauthenticated
  const { id } = await params
  const result = await getGoalDetail(id)

  if (!result.success || !result.data) {
    const t = await getTranslations('GoalDetail')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('loadFailed', { error: result.error ?? '' })}
      </div>
    )
  }

  return <GoalDetailClient detail={result.data} />
}
