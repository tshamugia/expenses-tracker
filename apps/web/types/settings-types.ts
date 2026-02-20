/**
 * Settings Domain Type Definitions
 */

export type Theme = 'light' | 'dark' | 'system'
export type Currency = 'GEL' | 'USD' | 'EUR'
export type SubscriptionPlan = 'free' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'active' | 'canceled' | 'expired'

export interface UserSettings {
  id: string
  userId: string
  emailEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
  notifyBeforeDays: number
  theme: Theme
  defaultCurrency: Currency
  subscriptionPlan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
}

export interface UpdateSettingsInput {
  emailEnabled?: boolean
  smsEnabled?: boolean
  pushEnabled?: boolean
  notifyBeforeDays?: number
  theme?: Theme
  defaultCurrency?: Currency
}

export interface SubscriptionPlanInfo {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  cta: string
  highlighted: boolean
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
