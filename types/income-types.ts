import type { IncomeSource, IncomeType } from '@prisma/client'
import type { IncomeForecast } from '@/lib/services/income-forecast'
import type { TransactionListItem } from '@/types/transaction-types'

/**
 * Income Types (Phase 1)
 * Type definitions for income sources, facts, and the conservative forecast
 */

export type { IncomeType }

// Serialized income source for client components (Decimal → number)
export type SerializedIncomeSource = Omit<IncomeSource, 'expectedAmount'> & {
  expectedAmount: number | null
}

export interface CreateIncomeSourceInput {
  name: string
  type: IncomeType
  expectedAmount?: number
  currency?: string
  expectedDay?: number
}

export interface UpdateIncomeSourceInput {
  name?: string
  type?: IncomeType
  expectedAmount?: number | null
  currency?: string
  expectedDay?: number | null
  isActive?: boolean
}

export interface RecordIncomeInput {
  incomeSourceId?: string
  amount: number
  currency?: string
  date?: Date
  description?: string
}

// Everything the /income page needs in one payload
export interface IncomeOverview {
  sources: SerializedIncomeSource[]
  monthTransactions: TransactionListItem[]
  monthTotal: number // current-month income in default currency
  defaultCurrency: string
  forecast: IncomeForecast
}
