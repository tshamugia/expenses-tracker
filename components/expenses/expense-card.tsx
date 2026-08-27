'use client'

import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Edit2, Trash2, CheckCircle, CreditCard } from 'lucide-react'
import type { ExpenseListItem } from '@/types/expense-types'
import type { Currency } from '@/types/settings-types'
import { ExpenseIcon } from './expense-icons'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { convertCurrency } from '@/lib/utils/currency-conversion'
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
      <Card className="group flex h-full flex-col overflow-hidden transition-all hover:shadow-lg">
        <div className="flex flex-1 flex-col p-4">
          {/* Top: icon + title/category + status */}
          <div className="flex items-start gap-3">
            <ExpenseIcon slug={expense.icon} size={40} className="mt-0.5" />

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">
                  {expense.title}
                </h3>
                <div className="shrink-0">{getStatusBadge(expense)}</div>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                {expense.category && <span className="truncate">{expense.category}</span>}
                {expense.isRecurring && (
                  <Badge variant="outline" className="text-xs">
                    Recurring
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
              {displayAmount}
            </p>
            {conversionText && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {conversionText}
              </p>
            )}
          </div>

          {/* Meta: due date + payment card (condensed) */}
          {(expense.nextDueDate || expense.paymentCard) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {expense.nextDueDate && (
                <span>Due {formatExpenseDate(expense.nextDueDate)}</span>
              )}
              {expense.paymentCard && (
                <span className="inline-flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  {expense.paymentCard.nickname ||
                    expense.paymentCard.cardBrand}
                  <span>••{expense.paymentCard.lastFourDigits}</span>
                </span>
              )}
            </div>
          )}

          {/* Actions — footer row so they always fit */}
          {(onEdit || onDelete || (!expense.isPaid && onMarkPaid)) && (
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/60">
              {!expense.isPaid && onMarkPaid && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onMarkPaid(expense.id)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-100 px-2.5 py-2 text-sm font-medium text-green-700 hover:bg-green-200 transition-colors dark:bg-green-900/20 dark:text-green-400"
                  title="Mark as paid"
                >
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span className="truncate">Paid</span>
                </motion.button>
              )}

              {onEdit && (
                <motion.button
                  variants={editButtonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  onClick={() => onEdit(expense)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-100 px-2.5 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors dark:bg-blue-900/20 dark:text-blue-400"
                  title="Edit expense"
                >
                  <Edit2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">Edit</span>
                </motion.button>
              )}

              {onDelete && (
                <motion.button
                  variants={deleteButtonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  onClick={() => onDelete(expense.id)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-100 px-2.5 py-2 text-sm font-medium text-red-700 hover:bg-red-200 transition-colors dark:bg-red-900/20 dark:text-red-400"
                  title="Delete expense"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">Delete</span>
                </motion.button>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  )
}
