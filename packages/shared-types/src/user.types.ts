/**
 * User Domain Type Definitions
 */

export interface UserProfile {
  id: string
  email: string
  name: string | null
  image: string | null
  provider: string | null
  hasPassword: boolean
  createdAt: Date
}

export interface UpdateProfileInput {
  name?: string | null
  email?: string
  image?: string | null
}

export interface SetPasswordInput {
  currentPassword?: string // Required if user already has password
  newPassword: string
  confirmPassword: string
}

export interface UserStats {
  totalExpenses: number
  totalAmount: number
  totalCards: number
}
