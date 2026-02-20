'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExpenseCard } from './expense-card'
import { ExpenseForm, type ExpenseFormData } from './expense-form'
import { DeleteConfirmation } from './delete-confirmation'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Loader2 } from 'lucide-react'
import { listContainer, fadeIn } from '@/lib/animations/variants'
import type { ExpenseListItem } from '@/types/expense-types'
import type { SerializedCategory } from '@/types/category-types'
import type { Currency } from '@/types/settings-types'
import { convertCurrency, getCurrencySymbol } from '@/lib/utils/currency-conversion'

interface ExpensesPageProps {
  initialExpenses?: ExpenseListItem[]
  categories: SerializedCategory[]
  onCreateExpense?: (data: ExpenseFormData) => Promise<void>
  onUpdateExpense?: (id: string, data: ExpenseFormData) => Promise<void>
  onDeleteExpense?: (id: string) => Promise<void>
  onMarkPaidExpense?: (id: string) => Promise<void>
  userId: string
  defaultCurrency: Currency
  currencyRates: {
    usd: { code: string; rate: number } | null
    eur: { code: string; rate: number } | null
    date: string | null
  }
}

export function ExpensesPage({
  initialExpenses = [],
  categories,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onMarkPaidExpense,
  userId,
  defaultCurrency,
  currencyRates,
}: ExpensesPageProps) {
  // Use prop directly - state is managed by Zustand store in parent
  const expenses = initialExpenses
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All Categories')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseListItem | null>(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter and search expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const matchesSearch = expense.title
        .toLowerCase()
        .includes(searchQuery.toLowerCase())

      const matchesCategory =
        selectedCategory === 'All Categories' ||
        expense.category === selectedCategory

      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'paid' && expense.isPaid) ||
        (selectedStatus === 'pending' && !expense.isPaid && !expense.isOverdue) ||
        (selectedStatus === 'overdue' && expense.isOverdue)

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [expenses, searchQuery, selectedCategory, selectedStatus])

  // Calculate stats - convert all amounts to default currency
  const stats = useMemo(() => {
    // Helper function to convert expense amount to default currency
    const convertToDefaultCurrency = (expense: ExpenseListItem): number => {
      const expenseCurrency = (expense.currency || 'GEL') as Currency

      // If same currency, no conversion needed
      if (expenseCurrency === defaultCurrency) {
        return expense.amount
      }

      // Convert the simplified rate to CurrencyRate format
      const usdRate = currencyRates.usd ? {
        ...currencyRates.usd,
        quantity: 1,
        rateFormated: '',
        diffFormated: '',
        name: 'US Dollar',
        diff: 0,
        date: currencyRates.date || '',
        validFromDate: currencyRates.date || ''
      } : null

      const eurRate = currencyRates.eur ? {
        ...currencyRates.eur,
        quantity: 1,
        rateFormated: '',
        diffFormated: '',
        name: 'Euro',
        diff: 0,
        date: currencyRates.date || '',
        validFromDate: currencyRates.date || ''
      } : null

      return convertCurrency(
        expense.amount,
        expenseCurrency,
        defaultCurrency,
        usdRate,
        eurRate
      )
    }

    return {
      total: expenses.reduce((sum, e) => sum + convertToDefaultCurrency(e), 0),
      paid: expenses
        .filter((e) => e.isPaid)
        .reduce((sum, e) => sum + convertToDefaultCurrency(e), 0),
      pending: expenses
        .filter((e) => !e.isPaid && !e.isOverdue)
        .reduce((sum, e) => sum + convertToDefaultCurrency(e), 0),
      overdue: expenses
        .filter((e) => e.isOverdue)
        .reduce((sum, e) => sum + convertToDefaultCurrency(e), 0),
    }
  }, [expenses, defaultCurrency, currencyRates])

  const handleCreateExpense = async (data: ExpenseFormData) => {
    setIsSubmitting(true)
    try {
      if (onCreateExpense) {
        await onCreateExpense(data)
      }

      // Optimistic update is handled by Zustand store in parent component
      setIsFormOpen(false)
    } catch (error) {
      console.error('Error creating expense:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditExpense = (expense: ExpenseListItem) => {
    setEditingExpense(expense)
    setIsFormOpen(true)
  }

  const handleUpdateExpense = async (data: ExpenseFormData) => {
    if (!editingExpense) return

    setIsSubmitting(true)
    try {
      if (onUpdateExpense) {
        await onUpdateExpense(editingExpense.id, data)
      }

      // Optimistic update is handled by Zustand store in parent component
      setEditingExpense(null)
      setIsFormOpen(false)
    } catch (error) {
      console.error('Error updating expense:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFormSubmit = editingExpense
    ? handleUpdateExpense
    : handleCreateExpense

  const handleDeleteExpense = async () => {
    if (!deleteExpenseId) return

    setIsDeleting(true)
    try {
      if (onDeleteExpense) {
        await onDeleteExpense(deleteExpenseId)
      }

      // Optimistic update is handled by Zustand store in parent component
      setDeleteExpenseId(null)
    } catch (error) {
      console.error('Error deleting expense:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleMarkPaid = async (expenseId: string) => {
    try {
      if (onMarkPaidExpense) {
        await onMarkPaidExpense(expenseId)
      }

      // Optimistic update is handled by Zustand store in parent component
    } catch (error) {
      console.error('Error marking expense as paid:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Expenses
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Manage and track all your expenses
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setEditingExpense(null)
              setIsFormOpen(true)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Expense
          </motion.button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total"
            value={`${getCurrencySymbol(defaultCurrency)}${stats.total.toFixed(2)}`}
            color="blue"
            delay={0}
          />
          <StatCard
            label="Paid"
            value={`${getCurrencySymbol(defaultCurrency)}${stats.paid.toFixed(2)}`}
            color="green"
            delay={0.1}
          />
          <StatCard
            label="Pending"
            value={`${getCurrencySymbol(defaultCurrency)}${stats.pending.toFixed(2)}`}
            color="yellow"
            delay={0.2}
          />
          <StatCard
            label="Overdue"
            value={`${getCurrencySymbol(defaultCurrency)}${stats.overdue.toFixed(2)}`}
            color="red"
            delay={0.3}
          />
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:gap-3"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Categories">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.categoryName}>
                {cat.categoryName}
              </SelectItem>
            ))}
            {categories.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No categories yet
              </div>
            )}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Expenses List */}
      <motion.div
        variants={listContainer}
        initial="initial"
        animate="animate"
      >
        <AnimatePresence mode="popLayout">
          {filteredExpenses.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-600 dark:bg-slate-800"
            >
              <p className="text-lg font-medium text-slate-900 dark:text-white">
                No expenses found
              </p>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                {expenses.length === 0
                  ? "Create your first expense to get started."
                  : "Try adjusting your filters or search query."}
              </p>
              {expenses.length === 0 && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setEditingExpense(null)
                    setIsFormOpen(true)
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create First Expense
                </motion.button>
              )}
            </motion.div>
          ) : (
            <div className="space-y-4">
              {filteredExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  onEdit={handleEditExpense}
                  onDelete={(id) => setDeleteExpenseId(id)}
                  onMarkPaid={handleMarkPaid}
                  defaultCurrency={defaultCurrency}
                  currencyRates={currencyRates}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Form Modal */}
      <ExpenseForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          setEditingExpense(null)
        }}
        onSubmit={handleFormSubmit}
        initialData={editingExpense}
        isLoading={isSubmitting}
        userId={userId}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={deleteExpenseId !== null}
        onConfirm={handleDeleteExpense}
        onCancel={() => setDeleteExpenseId(null)}
        title="Delete Expense?"
        description="This expense will be permanently deleted. This action cannot be undone."
        isLoading={isDeleting}
      />

      {/* Loading Overlay */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="h-8 w-8 text-white" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  color: 'blue' | 'green' | 'yellow' | 'red'
  delay: number
}

function StatCard({ label, value, color, delay }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-900/30',
    green:
      'from-green-500/10 to-green-500/5 border-green-200 dark:border-green-900/30',
    yellow:
      'from-yellow-500/10 to-yellow-500/5 border-yellow-200 dark:border-yellow-900/30',
    red: 'from-red-500/10 to-red-500/5 border-red-200 dark:border-red-900/30',
  }

  const labelColors = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    red: 'text-red-600 dark:text-red-400',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`rounded-lg border bg-gradient-to-br ${colorClasses[color]} p-4`}
    >
      <p className={`text-xs font-semibold uppercase ${labelColors[color]}`}>
        {label}
      </p>
      <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </motion.div>
  )
}
