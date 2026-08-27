import type { Expense, Payment, User, PaymentCard } from '@prisma/client'

// Extended types with relations
export type ExpenseWithPayments = Expense & {
  payments: Payment[]
}

// Expense with payment card and payments (for query results)
export type ExpenseWithRelationsData = Expense & {
  payments: Payment[]
  paymentCard: PaymentCard | null
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

// Query results that also include the linked payment card (e.g. getExpenses)
export type SerializedExpenseWithRelations = SerializedExpenseWithPayments & {
  paymentCard?: PaymentCard | null
}

export type ExpenseWithUser = Expense & {
  user: User
}

export type ExpenseWithRelations = Expense & {
  payments: Payment[]
  user: User
}

// Payment card info for display in expenses
export interface PaymentCardInfo {
  id: string
  nickname: string | null
  lastFourDigits: string
  cardBrand: string
  color: string
}

// View models for UI components
export interface ExpenseListItem {
  id: string
  title: string
  amount: number
  currency: string
  category: string | null
  icon: string | null
  nextDueDate: Date | null
  isOverdue: boolean
  isPaid: boolean
  isRecurring: boolean
  recurrenceRule: string | null
  paymentCard: PaymentCardInfo | null
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
