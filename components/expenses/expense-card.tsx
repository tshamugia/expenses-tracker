'use client'

import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Edit2, Trash2, CheckCircle } from 'lucide-react'
import type { ExpenseListItem } from '@/types/expense-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'
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
}: ExpenseCardProps) {
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
            <div className="flex-1 pr-4">
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
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(expense.amount, expense.currency)}
                </p>
                {getStatusBadge(expense)}
              </div>

              {/* Due Date */}
              {expense.nextDueDate && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Due: {formatExpenseDate(expense.nextDueDate)}
                </p>
              )}
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
