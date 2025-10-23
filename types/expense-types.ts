import type { Expense, Payment, User } from '@prisma/client'

// Extended types with relations
export type ExpenseWithPayments = Expense & {
  payments: Payment[]
}

export type ExpenseWithUser = Expense & {
  user: User
}

export type ExpenseWithRelations = Expense & {
  payments: Payment[]
  user: User
}

// View models for UI components
export interface ExpenseListItem {
  id: string
  title: string
  amount: number
  currency: string
  category: string | null
  nextDueDate: Date | null
  isOverdue: boolean
  isPaid: boolean
  isRecurring: boolean
}

export interface DashboardStats {
  total: number
  paid: number
  pending: number
  overdue: number
}

export interface DashboardData {
  expenses: ExpenseListItem[]
  stats: DashboardStats
}

// Filters for querying expenses
export interface ExpenseFilters {
  category?: string
  isRecurring?: boolean
  startDate?: Date
  endDate?: Date
}
