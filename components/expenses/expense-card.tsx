'use client'

import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Edit2, Trash2, CheckCircle } from 'lucide-react'
import type { ExpenseListItem } from '@/types/expense-types'
import type { Currency } from '@/types/settings-types'
import { PaymentCardDisplay } from './payment-card-display'
import { ExpenseIcon } from './expense-icons'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { formatCurrencyWithConversion, convertCurrency } from '@/lib/utils/currency-conversion'
import { formatExpenseDate } from '@/lib/utils/date-helpers'
import {
  expenseItemEntry,
  deleteButtonHover,
  editButtonHover,
} from '@/lib/animations/variants'

interface ExpenseCardProps {
  expense: ExpenseListItem
  onEdit?: (expense: ExpenseListItem) => void
  onDelete?: (id: string) => void
  onMarkPaid?: (id: string) => void
  defaultCurrency?: Currency
  currencyRates?: {
    usd: { code: string; rate: number } | null
    eur: { code: string; rate: number } | null
    date: string | null
  }
}

function getStatusBadge(expense: ExpenseListItem) {
  if (expense.isPaid) {
    return (
      <Badge variant="default" className="bg-green-600">
        Paid
      </Badge>
    )
  }
  if (expense.isOverdue) {
    return <Badge variant="destructive">Overdue</Badge>
  }
  return <Badge variant="secondary">Pending</Badge>
}

export function ExpenseCard({
  expense,
  onEdit,
  onDelete,
  onMarkPaid,
  defaultCurrency = 'GEL',
  currencyRates,
}: ExpenseCardProps) {
  // Format currency - show original currency first, then conversion
  const expenseCurrency = (expense.currency || 'GEL') as Currency
  const showConversion = expenseCurrency !== defaultCurrency && currencyRates

  // Always show the original amount in the expense's currency
  const displayAmount = formatCurrency(expense.amount, expense.currency)
  let conversionText: string | null = null

  // If different from default currency, show conversion as secondary text
  if (showConversion) {
    // Convert the simplified rate to CurrencyRate format
    const usdRate = currencyRates.usd ? { ...currencyRates.usd, quantity: 1, rateFormated: '', diffFormated: '', name: 'US Dollar', diff: 0, date: currencyRates.date || '', validFromDate: currencyRates.date || '' } : null
    const eurRate = currencyRates.eur ? { ...currencyRates.eur, quantity: 1, rateFormated: '', diffFormated: '', name: 'Euro', diff: 0, date: currencyRates.date || '', validFromDate: currencyRates.date || '' } : null

    const convertedAmount = convertCurrency(
      expense.amount,
      expenseCurrency,
      defaultCurrency,
      usdRate,
      eurRate
    )
    const symbol = defaultCurrency === 'GEL' ? '₾' : defaultCurrency === 'USD' ? '$' : '€'
    conversionText = `≈ ${symbol}${convertedAmount.toFixed(2)} ${defaultCurrency}`
  }
  return (
    <motion.div
      variants={expenseItemEntry}
      initial="initial"
      animate="animate"
      exit="exit"
      layout
    >
      <Card className="group overflow-hidden transition-all hover:shadow-lg">
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-1 items-start gap-3 pr-4">
              {/* Icon / Logo */}
              <ExpenseIcon slug={expense.icon} size={44} className="mt-0.5" />

              <div className="min-w-0 flex-1">
              {/* Title and Badge */}
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {expense.title}
                </h3>
                {expense.isRecurring && (
                  <Badge variant="outline" className="text-xs">
                    Recurring
                  </Badge>
                )}
              </div>

              {/* Category */}
              {expense.category && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {expense.category}
                </p>
              )}

              {/* Amount and Status */}
              <div className="mt-3 flex items-center gap-4">
                <div className="flex flex-col">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {displayAmount}
                  </p>
                  {conversionText && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {conversionText}
                    </p>
                  )}
                </div>
                {getStatusBadge(expense)}
              </div>

              {/* Payment Card Info */}
              {expense.paymentCard && (
                <div className="mt-3">
                  <PaymentCardDisplay paymentCard={expense.paymentCard} />
                </div>
              )}

              {/* Due Date */}
              {expense.nextDueDate && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Due: {formatExpenseDate(expense.nextDueDate)}
                </p>
              )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              {!expense.isPaid && onMarkPaid && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onMarkPaid(expense.id)}
                  className="inline-flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-200 transition-colors dark:bg-green-900/20 dark:text-green-400"
                  title="Mark as paid"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Paid</span>
                </motion.button>
              )}

              {onEdit && (
                <motion.button
                  variants={editButtonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  onClick={() => onEdit(expense)}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors dark:bg-blue-900/20 dark:text-blue-400"
                  title="Edit expense"
                >
                  <Edit2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Edit</span>
                </motion.button>
              )}

              {onDelete && (
                <motion.button
                  variants={deleteButtonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  onClick={() => onDelete(expense.id)}
                  className="inline-flex items-center gap-2 rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200 transition-colors dark:bg-red-900/20 dark:text-red-400"
                  title="Delete expense"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
