import { getExpenses } from '@/lib/actions/expense-actions'
import { ExpensesClient } from './expenses-client'
import { getAuthUserId } from '@/lib/auth/get-session'

// Server Component - fetches data from Prisma via business logic layer
export default async function ExpensesPage() {
  // Get authenticated user ID
  const userId = await getAuthUserId()

  // Fetch expenses on the server (Prisma)
  const result = await getExpenses(userId)

  const expenses = result.success && result.data ? result.data : []
  const error = result.success ? null : result.error || 'Failed to load expenses'

  return <ExpensesClient initialExpenses={expenses} error={error} userId={userId} />
}

