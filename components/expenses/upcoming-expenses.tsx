/**
 * UpcomingExpenses Component
 * Displays a list of upcoming expenses due within the next 30 days
 * Shows expense title, amount, category, and due date
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, DollarSign } from 'lucide-react'
import type { ExpenseListItem } from '@/types/expense-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { formatExpenseDate } from '@/lib/utils/date-helpers'

interface UpcomingExpensesProps {
  expenses: ExpenseListItem[]
  currency?: string
}

export function UpcomingExpenses({
  expenses,
  currency = 'USD',
}: UpcomingExpensesProps) {
  if (expenses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No upcoming expenses in the next 30 days
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Upcoming Expenses
          <Badge variant="secondary" className="ml-auto">
            {expenses.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{expense.title}</h3>
                  {expense.category && (
                    <Badge variant="outline" className="text-xs">
                      {expense.category}
                    </Badge>
                  )}
                  {expense.isRecurring && (
                    <Badge variant="secondary" className="text-xs">
                      Recurring
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Due {expense.nextDueDate ? formatExpenseDate(expense.nextDueDate) : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-lg font-semibold">
                <DollarSign className="h-4 w-4" />
                {formatCurrency(expense.amount, currency)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
