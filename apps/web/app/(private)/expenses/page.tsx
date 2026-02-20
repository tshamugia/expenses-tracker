import { getExpenses } from '@/lib/actions/expense-actions'
import { getUserCategories } from '@/lib/actions/category-actions'
import { getUserSettings } from '@/lib/actions/settings-actions'
import { getMainCurrencyRates } from '@/lib/services/currency'
import { ExpensesClient } from './expenses-client'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component - fetches data from Prisma via business logic layer
export default async function ExpensesPage() {
  // Get authenticated user ID
  const userId = await getAuthUserId()

  // Fetch expenses, categories, user settings, and currency rates on the server
  const [result, categories, settingsResult, currencyRates] = await Promise.all([
    getExpenses(userId),
    getUserCategories(userId),
    getUserSettings(),
    getMainCurrencyRates(),
  ])

  const expenses = result.success ? result.data : []
  const error = result.success ? null : result.error
  const defaultCurrency = settingsResult.success
    ? settingsResult.data.defaultCurrency
    : 'GEL'

  return (
    <ExpensesClient
      initialExpenses={expenses}
      categories={categories}
      error={error}
      userId={userId}
      defaultCurrency={defaultCurrency}
      currencyRates={currencyRates}
    />
  )
}

