/**
 * UpcomingExpenses Component
 * Displays a list of upcoming expenses due within the next 30 days
 * Shows expense title, amount, category, and due date
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, DollarSign } from 'lucide-react'
import type { ExpenseListItem } from '@/types/expense-types'
import type { CurrencyRate } from '@/lib/services/currency'
import { PaymentCardDisplay } from './payment-card-display'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { formatExpenseDate } from '@/lib/utils/date-helpers'
import { formatCurrencyWithConversion, type Currency } from '@/lib/utils/currency-conversion'

interface UpcomingExpensesProps {
  expenses: ExpenseListItem[]
  defaultCurrency?: Currency
  currencyRates?: {
    usd: CurrencyRate | null
    eur: CurrencyRate | null
  } | null
}

export function UpcomingExpenses({
  expenses,
  defaultCurrency = 'GEL',
  currencyRates,
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
              className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                <div className="text-right">
                  {(() => {
                    const expenseCurrency = (expense.currency as Currency) || 'GEL'
                    const formatted = formatCurrencyWithConversion(
                      expense.amount,
                      expenseCurrency,
                      defaultCurrency,
                      currencyRates?.usd || null,
                      currencyRates?.eur || null
                    )
                    return (
                      <>
                        <div className="text-lg font-semibold">{formatted.main}</div>
                        {formatted.conversion && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatted.conversion}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Payment Card Info */}
              {expense.paymentCard && (
                <div className="border-t pt-3">
                  <PaymentCardDisplay paymentCard={expense.paymentCard} />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
