import type { PaymentCard, Expense } from '@prisma/client'

// Extended types with relations
export type PaymentCardWithExpenses = PaymentCard & {
  expenses: Expense[]
}

// Serialized versions for Client Components
export type SerializedPaymentCard = PaymentCard

// View models for UI components
export interface PaymentCardListItem {
  id: string
  cardholderName: string
  lastFourDigits: string
  expiryMonth: number
  expiryYear: number
  cardBrand: string
  nickname: string | null
  color: string
  expenseCount?: number
}

// Input types for CRUD operations
export interface CreatePaymentCardInput {
  userId: string
  cardholderName: string
  cardNumber: string // Full number for validation, only last 4 stored
  expiryMonth: number
  expiryYear: number
  nickname?: string
  color?: string
}

export interface UpdatePaymentCardInput {
  cardholderName?: string
  expiryMonth?: number
  expiryYear?: number
  nickname?: string
  color?: string
}

// Card brand types
export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Unknown'

// Card validation result
export interface CardValidationResult {
  isValid: boolean
  brand: CardBrand
  error?: string
}
