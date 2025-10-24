/**
 * Settings Domain Type Definitions
 */

export type Theme = 'light' | 'dark' | 'system'
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
  subscriptionPlan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
}

export interface UpdateSettingsInput {
  emailEnabled?: boolean
  smsEnabled?: boolean
  pushEnabled?: boolean
  notifyBeforeDays?: number
  theme?: Theme
}

export interface SubscriptionPlanInfo {
  name: string
  price: string
  features: string[]
  popular?: boolean
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
