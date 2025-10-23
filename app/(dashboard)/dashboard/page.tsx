import { getDashboardData } from '@/lib/actions/expense-actions'
import { ExpenseStats } from '@/components/expenses/expense-stats'
import { ExpenseList } from '@/components/expenses/expense-list'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

// Demo user ID - will be replaced with auth session in Phase 3
const DEMO_USER_ID = '2e1562f2-dedb-400a-9bc0-a1b647e26e32'

export default async function DashboardPage() {
  // Call Server Action (Business Logic Layer)
  const { expenses, stats } = await getDashboardData(DEMO_USER_ID)

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s an overview of your expenses.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* Stats Cards */}
      <ExpenseStats data={stats} />

      {/* Recent Expenses */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Expenses</h2>
          <Button variant="outline" size="sm">
            View All
          </Button>
        </div>
        <ExpenseList expenses={expenses} />
      </div>
    </div>
  )
}
