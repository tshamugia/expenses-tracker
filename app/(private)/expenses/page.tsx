import { getExpenses } from '@/lib/actions/expense-actions'
import { ExpensesClient } from './expenses-client'
import { DEMO_USER_ID } from '@/lib/constants/app-config'

// Server Component - fetches data from Prisma via business logic layer
export default async function ExpensesPage() {
  // TODO: Get user ID from authentication
  const userId = DEMO_USER_ID // Replace with actual user ID from auth

  // Fetch expenses on the server (Prisma)
  const result = await getExpenses(userId)

  const expenses = result.success && result.data ? result.data : []
  const error = result.success ? null : result.error || 'Failed to load expenses'

  return <ExpensesClient initialExpenses={expenses} error={error} userId={userId} />
}

