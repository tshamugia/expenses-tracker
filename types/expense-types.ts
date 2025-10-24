import type { Expense, Payment, User } from '@prisma/client'

// Extended types with relations
export type ExpenseWithPayments = Expense & {
  payments: Payment[]
}

// Serialized versions for Client Components (Decimal → number)
export type SerializedPayment = Omit<Payment, 'amount'> & {
  amount: number
}

export type SerializedExpense = Omit<Expense, 'amount'> & {
  amount: number
}

export type SerializedExpenseWithPayments = SerializedExpense & {
  payments: SerializedPayment[]
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
  count: number
}

export interface CategoryData {
  category: string
  amount: number
  count: number
}

export interface DashboardData {
  expenses: ExpenseListItem[]
  stats: DashboardStats
  upcomingExpenses: ExpenseListItem[]
  categoryData: CategoryData[]
}

// Filters for querying expenses
export interface ExpenseFilters {
  category?: string
  isRecurring?: boolean
  startDate?: Date
  endDate?: Date
}
