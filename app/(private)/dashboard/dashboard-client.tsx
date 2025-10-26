'use client'

/**
 * Client Component for Dashboard
 * - Handles Add Expense modal
 * - Uses Zustand for optimistic updates
 * - Calls Server Actions for mutations
 */

import { useState, useTransition, useMemo } from 'react'
import { ExpenseStats } from '@/components/expenses/expense-stats'
import { ExpenseCharts } from '@/components/expenses/expense-charts'
import { UpcomingExpenses } from '@/components/expenses/upcoming-expenses'
import { ExpenseForm, type ExpenseFormData } from '@/components/expenses/expense-form'
import { CurrencyRates } from '@/components/currency/currency-rates'
import { CurrencyCalculator } from '@/components/currency/currency-calculator'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { createExpense } from '@/lib/actions/expense-actions'
import { toast } from 'sonner'
import type { DashboardData, ExpenseListItem } from '@/types/expense-types'
import type { CurrencyRate } from '@/lib/services/currency'
import type { Currency } from '@/lib/utils/currency-conversion'
import { convertCurrency } from '@/lib/utils/currency-conversion'

interface DashboardClientProps {
  dashboardData: DashboardData
  userId: string
  currencyRates: {
    usd: CurrencyRate | null
    eur: CurrencyRate | null
    date: string | null
  } | null
  defaultCurrency: Currency
}

export function DashboardClient({
  dashboardData,
  userId,
  currencyRates,
  defaultCurrency
}: DashboardClientProps) {
  const { expenses, upcomingExpenses, categoryData } = dashboardData
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  // Recalculate stats with currency conversion
  const stats = useMemo(() => {
    // Helper function to convert expense amount to default currency
    const convertToDefaultCurrency = (expense: ExpenseListItem): number => {
      const expenseCurrency = (expense.currency || 'GEL') as Currency

      // If same currency, no conversion needed
      if (expenseCurrency === defaultCurrency) {
        return expense.amount
      }

      // Convert the simplified rate to CurrencyRate format
      const usdRate = currencyRates?.usd ? {
        ...currencyRates.usd,
        quantity: 1,
        rateFormated: '',
        diffFormated: '',
        name: 'US Dollar',
        diff: 0,
        date: currencyRates.date || '',
        validFromDate: currencyRates.date || ''
      } : null

      const eurRate = currencyRates?.eur ? {
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

    // Calculate stats with currency conversion
    const convertedStats = expenses.reduce(
      (acc, expense) => {
        const convertedAmount = convertToDefaultCurrency(expense)
        acc.total += convertedAmount
        acc.count += 1

        if (expense.isPaid) {
          acc.paid += convertedAmount
        } else if (expense.isOverdue) {
          acc.overdue += convertedAmount
        } else {
          acc.pending += convertedAmount
        }

        return acc
      },
      { total: 0, paid: 0, pending: 0, overdue: 0, count: 0 }
    )

    return convertedStats
  }, [expenses, defaultCurrency, currencyRates])

  const handleCreateExpense = async (data: ExpenseFormData) => {
    setIsSubmitting(true)
    try {
      // Call Server Action
      startTransition(async () => {
        const result = await createExpense({
          userId,
          title: data.title,
          amount: data.amount,
          currency: data.currency || 'GEL',
          category: data.category,
          description: data.notes,
          nextDueDate: new Date(data.date),
        })

        if (result.success && result.data) {
          toast.success('Expense created successfully!')
          setIsFormOpen(false)
          // The page will automatically revalidate and show the new expense
        } else {
          toast.error('Failed to create expense', {
            description: result.error || 'Unknown error',
          })
        }
        setIsSubmitting(false)
      })
    } catch (err) {
      console.error('Error creating expense:', err)
      toast.error('Failed to create expense')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back! Here&apos;s an overview of your expenses.
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        </div>

        {/* Stats Cards - Now includes Total Count */}
        <ExpenseStats data={stats} currency={defaultCurrency} />

        {/* Currency Section - Exchange Rates and Calculator */}
        <div className="grid gap-4 md:grid-cols-2">
          <CurrencyRates
            usd={currencyRates?.usd || null}
            eur={currencyRates?.eur || null}
            date={currencyRates?.date || null}
          />
          <CurrencyCalculator
            usd={currencyRates?.usd || null}
            eur={currencyRates?.eur || null}
          />
        </div>

        {/* Interactive Charts - Bar and Pie Charts */}
        <ExpenseCharts categoryData={categoryData} stats={stats} />

        {/* Upcoming Expenses - Replaces Expense Cards */}
        <UpcomingExpenses
          expenses={upcomingExpenses}
          defaultCurrency={defaultCurrency}
          currencyRates={currencyRates}
        />
      </div>

      {/* Expense Form Modal */}
      <ExpenseForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateExpense}
        initialData={null}
        isLoading={isSubmitting}
        userId={userId}
      />
    </>
  )
}
