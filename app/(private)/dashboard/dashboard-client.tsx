'use client'

/**
 * Client Component for Dashboard
 * - Handles Add Expense modal
 * - Uses Zustand for optimistic updates
 * - Calls Server Actions for mutations
 */

import { useState, useTransition } from 'react'
import { ExpenseStats } from '@/components/expenses/expense-stats'
import { ExpenseCharts } from '@/components/expenses/expense-charts'
import { UpcomingExpenses } from '@/components/expenses/upcoming-expenses'
import { ExpenseForm, type ExpenseFormData } from '@/components/expenses/expense-form'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { createExpense } from '@/lib/actions/expense-actions'
import { toast } from 'sonner'
import type { DashboardData } from '@/types/expense-types'

interface DashboardClientProps {
  dashboardData: DashboardData
  userId: string
}

export function DashboardClient({ dashboardData, userId }: DashboardClientProps) {
  const { stats, upcomingExpenses, categoryData } = dashboardData
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  const handleCreateExpense = async (data: ExpenseFormData) => {
    setIsSubmitting(true)
    try {
      // Call Server Action
      startTransition(async () => {
        const result = await createExpense({
          userId,
          title: data.title,
          amount: data.amount,
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
        <ExpenseStats data={stats} />

        {/* Interactive Charts - Bar and Pie Charts */}
        <ExpenseCharts categoryData={categoryData} stats={stats} />

        {/* Upcoming Expenses - Replaces Expense Cards */}
        <UpcomingExpenses expenses={upcomingExpenses} />
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
