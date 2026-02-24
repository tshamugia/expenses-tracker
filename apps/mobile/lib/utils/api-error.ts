/**
 * Utility to extract human-readable error messages from Eden Treaty responses.
 *
 * Eden Treaty errors can arrive in several shapes:
 *   1. `{ status: number, value: { error?: string, message?: string } }` -- typical Elysia error
 *   2. Standard `Error` instance -- network failures, JSON parse errors, etc.
 *   3. Unknown value -- anything else that might slip through
 */

interface EdenTreatyError {
  status: number
  value: {
    error?: string
    message?: string
  }
}

function isEdenTreatyError(error: unknown): error is EdenTreatyError {
  if (typeof error !== 'object' || error === null) return false
  const obj = error as Record<string, unknown>
  return (
    typeof obj.status === 'number' &&
    typeof obj.value === 'object' &&
    obj.value !== null
  )
}

/**
 * Extract a user-facing error message from an Eden Treaty error response.
 *
 * @param error  - The error thrown or returned by an Eden Treaty call.
 * @param fallback - Default message when the error cannot be parsed.
 * @returns A single descriptive string suitable for display in a snackbar / alert.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong',
): string {
  // Eden Treaty structured error
  if (isEdenTreatyError(error)) {
    const { value } = error
    if (typeof value.message === 'string' && value.message.length > 0) {
      return value.message
    }
    if (typeof value.error === 'string' && value.error.length > 0) {
      return value.error
    }
    return fallback
  }

  // Standard Error instance
  if (error instanceof Error) {
    return error.message || fallback
  }

  // Bare string (rare, but possible)
  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return fallback
}
