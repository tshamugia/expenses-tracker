'use client'

/**
 * Client Component for Expenses Management
 * - Uses Zustand for client-side state
 * - Calls Server Actions for mutations
 * - Implements optimistic updates
 * - Framer Motion animations
 */

import { useEffect, useTransition } from 'react'
import { useExpenseStore } from '@/lib/stores/expense-store'
import { ExpensesPage as ExpensesUI } from '@/components/expenses/expenses-page'
import type { ExpenseFormData } from '@/components/expenses/expense-form'
import type { ExpenseListItem, SerializedExpenseWithRelations } from '@/types/expense-types'
import type { SerializedCategory } from '@/types/category-types'
import type { Currency } from '@/types/settings-types'
import {
  createExpense,
  updateExpense,
  deleteExpense,
  markExpensePaid,
} from '@/lib/actions/expense-actions'
import { buildRecurrenceRule, type RecurrenceFrequency } from '@/lib/utils/date-helpers'
import { toast } from 'sonner'

interface ExpensesClientProps {
  initialExpenses: SerializedExpenseWithRelations[]
  categories: SerializedCategory[]
  error: string | null
  userId: string
  defaultCurrency: Currency
  currencyRates: {
    usd: { code: string; rate: number } | null
    eur: { code: string; rate: number } | null
    date: string | null
  }
}

// Transform Prisma expense to UI expense
function transformExpense(expense: SerializedExpenseWithRelations): ExpenseListItem {
  const latestPayment = expense.payments?.[0]
  const nextDueDate = expense.nextDueDate
  const isPaid = latestPayment?.paid ?? false
  const isOverdue = nextDueDate ? nextDueDate < new Date() && !isPaid : false

  return {
    id: expense.id,
    title: expense.title,
    amount: expense.amount, // Already serialized as number
    currency: expense.currency,
    category: expense.category || null,
    icon: expense.icon ?? null,
    isRecurring: expense.isRecurring,
    recurrenceRule: expense.recurrenceRule ?? null,
    nextDueDate: nextDueDate || null,
    isPaid,
    isOverdue,
    paymentCard: expense.paymentCard
      ? {
          id: expense.paymentCard.id,
          nickname: expense.paymentCard.nickname,
          lastFourDigits: expense.paymentCard.lastFourDigits,
          cardBrand: expense.paymentCard.cardBrand,
          color: expense.paymentCard.color,
        }
      : null,
  }
}

// Convert the form's recurrence option into the fields the server action expects
function resolveRecurrence(recurrence: ExpenseFormData['recurrence']): {
  isRecurring: boolean
  recurrenceRule?: string
} {
  if (!recurrence || recurrence === 'none') {
    return { isRecurring: false }
  }
  return {
    isRecurring: true,
    recurrenceRule: buildRecurrenceRule(recurrence as RecurrenceFrequency),
  }
}

export function ExpensesClient({ initialExpenses, categories, error, userId, defaultCurrency, currencyRates }: ExpensesClientProps) {
  const {
    expenses,
    setExpenses,
    optimisticAdd,
    optimisticUpdate,
    optimisticRemove,
    optimisticMarkPaid,
  } = useExpenseStore()

  const [, startTransition] = useTransition()

  // Initialize store with server data
  useEffect(() => {
    const transformed = initialExpenses.map(transformExpense)
    setExpenses(transformed)
  }, [initialExpenses, setExpenses])

  // Show error if initial fetch failed
  useEffect(() => {
    if (error) {
      toast.error('Failed to load expenses', {
        description: error,
      })
    }
  }, [error])

  /**
   * CREATE: Add new expense with optimistic update
   */
  const handleCreateExpense = async (data: ExpenseFormData) => {
    try {
      const { isRecurring, recurrenceRule } = resolveRecurrence(data.recurrence)

      // Create optimistic expense
      const optimisticExpense: ExpenseListItem = {
        id: `temp-${Date.now()}`,
        title: data.title,
        amount: data.amount,
        currency: data.currency || 'GEL',
        category: data.category,
        icon: data.icon ?? null,
        isRecurring,
        recurrenceRule: recurrenceRule ?? null,
        nextDueDate: new Date(data.date),
        isPaid: false,
        isOverdue: false,
        paymentCard: null,
      }

      // Optimistic update
      optimisticAdd(optimisticExpense)

      // Call Server Action
      startTransition(async () => {
        const result = await createExpense({
          userId,
          title: data.title,
          amount: data.amount,
          currency: data.currency,
          category: data.category,
          icon: data.icon ?? null,
          description: data.notes,
          paymentCardId: data.paymentCardId === 'none' ? undefined : data.paymentCardId,
          nextDueDate: new Date(data.date),
          isRecurring,
          recurrenceRule,
        })

        if (result.success && result.data) {
          // Replace optimistic with real data
          const realExpense = transformExpense({
            ...result.data,
            payments: [],
          })
          
          optimisticRemove(optimisticExpense.id)
          optimisticAdd(realExpense)

          toast.success('Expense created successfully!')
        } else {
          // Rollback optimistic update
          optimisticRemove(optimisticExpense.id)
          toast.error('Failed to create expense', {
            description: result.error || 'Unknown error',
          })
        }
      })
    } catch (err) {
      console.error('Error creating expense:', err)
      toast.error('Failed to create expense')
    }
  }

  /**
   * UPDATE: Edit existing expense with optimistic update
   */
  const handleUpdateExpense = async (id: string, data: ExpenseFormData) => {
    try {
      // Store original for rollback
      const original = expenses.find((e) => e.id === id)
      if (!original) return

      const { isRecurring, recurrenceRule } = resolveRecurrence(data.recurrence)

      // Optimistic update
      optimisticUpdate(id, {
        title: data.title,
        amount: data.amount,
        currency: data.currency || original.currency,
        category: data.category,
        icon: data.icon ?? null,
        isRecurring,
        recurrenceRule: recurrenceRule ?? null,
        nextDueDate: new Date(data.date),
      })

      // Call Server Action
      startTransition(async () => {
        const result = await updateExpense(id, userId, {
          title: data.title,
          amount: data.amount,
          currency: data.currency,
          category: data.category,
          icon: data.icon ?? null,
          description: data.notes,
          paymentCardId: data.paymentCardId === 'none' ? undefined : data.paymentCardId,
          nextDueDate: new Date(data.date),
          isRecurring,
          recurrenceRule,
        })

        if (result.success && result.data) {
          // Confirm with real data
          const realExpense = transformExpense({
            ...result.data,
            payments: [],
          })
          
          optimisticUpdate(id, realExpense)
          toast.success('Expense updated successfully!')
        } else {
          // Rollback optimistic update
          optimisticUpdate(id, original)
          toast.error('Failed to update expense', {
            description: result.error || 'Unknown error',
          })
        }
      })
    } catch (err) {
      console.error('Error updating expense:', err)
      toast.error('Failed to update expense')
    }
  }

  /**
   * DELETE: Remove expense with optimistic update and animation
   */
  const handleDeleteExpense = async (id: string) => {
    try {
      // Store original for rollback
      const original = expenses.find((e) => e.id === id)
      if (!original) return

      // Optimistic remove (with animation)
      optimisticRemove(id)

      // Call Server Action
      startTransition(async () => {
        const result = await deleteExpense(id, userId)

        if (result.success) {
          toast.success('Expense deleted successfully!')
        } else {
          // Rollback optimistic update
          optimisticAdd(original)
          toast.error('Failed to delete expense', {
            description: result.error || 'Unknown error',
          })
        }
      })
    } catch (err) {
      console.error('Error deleting expense:', err)
      toast.error('Failed to delete expense')
    }
  }

  /**
   * MARK PAID: Update payment status with optimistic update
   */
  const handleMarkPaidExpense = async (id: string) => {
    try {
      // Store original for rollback
      const original = expenses.find((e) => e.id === id)
      if (!original) return

      // Optimistic update
      optimisticMarkPaid(id)

      // Call Server Action
      startTransition(async () => {
        const result = await markExpensePaid(id, userId)

        if (result.success) {
          toast.success('Marked as paid!')
        } else {
          // Rollback optimistic update
          optimisticUpdate(id, original)
          toast.error('Failed to mark as paid', {
            description: result.error || 'Unknown error',
          })
        }
      })
    } catch (err) {
      console.error('Error marking expense as paid:', err)
      toast.error('Failed to mark as paid')
    }
  }

  return (
    <ExpensesUI
      initialExpenses={expenses}
      categories={categories}
      onCreateExpense={handleCreateExpense}
      onUpdateExpense={handleUpdateExpense}
      onDeleteExpense={handleDeleteExpense}
      onMarkPaidExpense={handleMarkPaidExpense}
      userId={userId}
      defaultCurrency={defaultCurrency}
      currencyRates={currencyRates}
    />
  )
}
