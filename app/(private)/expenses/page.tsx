import { getExpenses } from '@/lib/actions/expense-actions'
import {
  getCategoriesWithSpend,
  getUserCategories,
} from '@/lib/actions/category-actions'
import { getUserSettings } from '@/lib/actions/settings-actions'
import { getTransactions } from '@/lib/actions/transaction-actions'
import { getMainCurrencyRates } from '@/lib/services/currency'
import { CategorySpendList } from '@/components/categories/category-spend-list'
import { ExpensesTabs } from '@/components/expenses/expenses-tabs'
import { TransactionList } from '@/components/transactions/transaction-list'
import { ExpensesClient } from './expenses-client'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component - fetches data from Prisma via business logic layer
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  // Get authenticated user ID
  const userId = await getAuthUserId()
  const { tab } = await searchParams

  // Fetch expenses, ledger, categories, user settings, and currency rates
  const [result, categories, settingsResult, currencyRates, transactionsResult, spendResult] =
    await Promise.all([
      getExpenses(userId),
      getUserCategories(userId),
      getUserSettings(),
      getMainCurrencyRates(),
      getTransactions({ type: 'EXPENSE', page: 1, pageSize: 20 }),
      getCategoriesWithSpend(),
    ])

  const expenses = result.success && result.data ? result.data : []
  const error = result.success ? null : result.error || 'Failed to load expenses'
  const defaultCurrency = settingsResult.success && settingsResult.data
    ? settingsResult.data.defaultCurrency
    : 'GEL'
  const transactions = transactionsResult.success ? transactionsResult.data : undefined
  const categoriesWithSpend = spendResult.success && spendResult.data ? spendResult.data : []

  return (
    <ExpensesTabs
      defaultTab={tab ?? 'fixed'}
      fixed={
        <ExpensesClient
          initialExpenses={expenses}
          categories={categories}
          error={error}
          userId={userId}
          defaultCurrency={defaultCurrency}
          currencyRates={currencyRates}
        />
      }
      variable={
        <TransactionList
          initialTransactions={transactions?.items ?? []}
          totalCount={transactions?.totalCount ?? 0}
          categories={categoriesWithSpend.map(({ id, categoryName }) => ({ id, categoryName }))}
        />
      }
      categories={
        <CategorySpendList
          categories={categoriesWithSpend}
          defaultCurrency={defaultCurrency}
        />
      }
    />
  )
}
