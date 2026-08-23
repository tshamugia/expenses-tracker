import { getTranslations } from 'next-intl/server'
import { IncomeClient } from '@/components/income/income-client'
import { getIncomeOverview } from '@/lib/actions/income-actions'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component — fetches the income overview via the business logic layer
export default async function IncomePage() {
  await getAuthUserId() // redirects to /login when unauthenticated
  const result = await getIncomeOverview()

  if (!result.success || !result.data) {
    const t = await getTranslations('Income')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('loadFailed', { error: result.error ?? '' })}
      </div>
    )
  }

  return <IncomeClient overview={result.data} />
}
