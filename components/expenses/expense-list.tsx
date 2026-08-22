import { ExpenseCard } from './expense-card'
import type { ExpenseListItem } from '@/types/expense-types'

interface ExpenseListProps {
  expenses: ExpenseListItem[]
}

export function ExpenseList({ expenses }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center sm:p-12">
        <p className="text-muted-foreground">
          No expenses found. Create your first expense to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {expenses.map((expense) => (
        <ExpenseCard key={expense.id} expense={expense} />
      ))}
    </div>
  )
}
