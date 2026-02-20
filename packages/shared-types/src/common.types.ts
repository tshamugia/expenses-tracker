/**
 * Common shared types used across the application
 */

/**
 * Discriminated union for action results.
 * Enables TypeScript narrowing: check `result.success` to access `data` or `error`.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Paginated response wrapper for future API use
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string
  message: string
  statusCode: number
}
