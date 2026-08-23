import { getTranslations } from 'next-intl/server'
import { DebtDetailClient } from '@/components/debts/debt-detail-client'
import { getDebtDetail } from '@/lib/actions/debt-actions'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component — fetches one debt's full detail (schedule + progress)
export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await getAuthUserId() // redirects to /login when unauthenticated
  const { id } = await params
  const result = await getDebtDetail(id)

  if (!result.success || !result.data) {
    const t = await getTranslations('DebtDetail')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('loadFailed', { error: result.error ?? '' })}
      </div>
    )
  }

  return <DebtDetailClient detail={result.data} />
}
