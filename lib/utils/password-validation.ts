import { MIN_PASSWORD_LENGTH } from '@/lib/constants/app-config'

export interface PasswordValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Validate password strength.
 * Rules: minimum length, at least one uppercase, one lowercase, and one number.
 * Returns the first failing rule's message so it can be surfaced to the user.
 *
 * Pure function - safe to import in both Server Actions and Client Components.
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    }
  }

  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one uppercase letter',
    }
  }

  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one lowercase letter',
    }
  }

  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one number',
    }
  }

  return { isValid: true }
}
