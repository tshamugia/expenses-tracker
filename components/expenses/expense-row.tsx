'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Edit2, Trash2, CheckCircle, CreditCard } from 'lucide-react'
import type { ExpenseListItem } from '@/types/expense-types'
import type { Currency } from '@/types/settings-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { convertCurrency } from '@/lib/utils/currency-conversion'
import { formatExpenseDate } from '@/lib/utils/date-helpers'
import { expenseItemEntry } from '@/lib/animations/variants'
import { ExpenseIcon } from './expense-icons'

interface ExpenseRowProps {
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

export function ExpenseRow({
  expense,
  onEdit,
  onDelete,
  onMarkPaid,
  defaultCurrency = 'GEL',
  currencyRates,
}: ExpenseRowProps) {
  const expenseCurrency = (expense.currency || 'GEL') as Currency
  const showConversion = expenseCurrency !== defaultCurrency && currencyRates

  const displayAmount = formatCurrency(expense.amount, expense.currency)
  let conversionText: string | null = null

  if (showConversion) {
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
    conversionText = `≈ ${symbol}${convertedAmount.toFixed(2)}`
  }

  return (
    <motion.div
      variants={expenseItemEntry}
      initial="initial"
      animate="animate"
      exit="exit"
      layout
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 sm:px-4"
    >
      {/* Icon / Logo */}
      <ExpenseIcon slug={expense.icon} size={40} />

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-slate-900 dark:text-white">
            {expense.title}
          </h3>
          {expense.isRecurring && (
            <Badge variant="outline" className="hidden shrink-0 text-xs sm:inline-flex">
              Recurring
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {expense.category && <span className="truncate">{expense.category}</span>}
          {expense.category && expense.nextDueDate && <span className="hidden sm:inline">•</span>}
          {expense.nextDueDate && (
            <span className="hidden sm:inline">Due {formatExpenseDate(expense.nextDueDate)}</span>
          )}
          {expense.paymentCard && (
            <>
              <span className="hidden sm:inline">•</span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <CreditCard className="h-3 w-3" />
                {expense.paymentCard.nickname || `•••• ${expense.paymentCard.lastFourDigits}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Amount — always visible, key info on mobile */}
      <div className="flex shrink-0 flex-col items-end">
        <p className="whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white sm:text-base">
          {displayAmount}
        </p>
        {conversionText && (
          <p className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
            {conversionText}
          </p>
        )}
      </div>

      {/* Status — full badge on larger screens, colour dot on mobile */}
      <div className="hidden shrink-0 sm:block">{getStatusBadge(expense)}</div>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full sm:hidden ${
          expense.isPaid
            ? 'bg-green-500'
            : expense.isOverdue
            ? 'bg-red-500'
            : 'bg-slate-400'
        }`}
        aria-hidden
      />

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {!expense.isPaid && onMarkPaid && (
          <button
            onClick={() => onMarkPaid(expense.id)}
            className="inline-flex items-center justify-center rounded-md p-2 text-green-700 hover:bg-green-100 transition-colors dark:text-green-400 dark:hover:bg-green-900/20"
            title="Mark as paid"
          >
            <CheckCircle className="h-4 w-4" />
          </button>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(expense)}
            className="inline-flex items-center justify-center rounded-md p-2 text-blue-700 hover:bg-blue-100 transition-colors dark:text-blue-400 dark:hover:bg-blue-900/20"
            title="Edit expense"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(expense.id)}
            className="inline-flex items-center justify-center rounded-md p-2 text-red-700 hover:bg-red-100 transition-colors dark:text-red-400 dark:hover:bg-red-900/20"
            title="Delete expense"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  )
}
