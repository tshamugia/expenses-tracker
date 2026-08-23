import type { EntrySource, Transaction, TransactionType } from '@prisma/client'

/**
 * Transaction Types (Phase 1 — unified ledger)
 * Type definitions for variable expenses and income facts
 */

export type { EntrySource, Transaction, TransactionType }

// Serialized transaction for client components (Decimal → number)
export type SerializedTransaction = Omit<Transaction, 'amount'> & {
  amount: number
}

// View model for transaction lists (includes category display info)
export interface TransactionListItem {
  id: string
  type: TransactionType
  amount: number
  currency: string
  date: Date
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  incomeSourceId: string | null
  incomeSourceName: string | null
  expenseId: string | null
  description: string | null
  entrySource: EntrySource
}

// Input for the global quick-add expense flow
export interface QuickAddExpenseInput {
  amount: number
  categoryId: string
  currency?: string
  description?: string
  date?: Date
}

// Input for updating a transaction
export interface UpdateTransactionInput {
  amount?: number
  currency?: string
  date?: Date
  categoryId?: string | null
  description?: string | null
}

// Filters for transaction queries
export interface TransactionFilters {
  type?: TransactionType
  categoryId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export interface TransactionPage {
  items: TransactionListItem[]
  totalCount: number
  page: number
  pageSize: number
}
