import { getTranslations } from 'next-intl/server'
import { DebtsClient } from '@/components/debts/debts-client'
import { getDebts } from '@/lib/actions/debt-actions'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component — fetches the debts overview via the business logic layer
export default async function DebtsPage() {
  await getAuthUserId() // redirects to /login when unauthenticated
  const result = await getDebts()

  if (!result.success || !result.data) {
    const t = await getTranslations('Debts')
    return (
      <div className="py-24 text-center text-muted-foreground">
        {t('loadFailed', { error: result.error ?? '' })}
      </div>
    )
  }

  return <DebtsClient overview={result.data} />
}
