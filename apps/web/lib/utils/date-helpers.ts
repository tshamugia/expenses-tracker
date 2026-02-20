/**
 * Date helper utilities for expense tracking
 * Following Next.js and Prisma best practices
 */

/**
 * Check if a date is overdue (past current date)
 */
export function isOverdue(date: Date | null): boolean {
  if (!date) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0) // Compare dates without time
  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)
  return compareDate < now
}

/**
 * Check if a date is due soon (within threshold days)
 */
export function isDueSoon(date: Date | null, thresholdDays: number = 3): boolean {
  if (!date) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)
  const diffTime = compareDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays >= 0 && diffDays <= thresholdDays
}

/**
 * Format date for display (e.g., "Jan 15, 2024")
 */
export function formatExpenseDate(date: Date | null): string {
  if (!date) return 'No date'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

/**
 * Format date as relative time (e.g., "in 3 days", "2 days ago")
 */
export function formatRelativeDate(date: Date | null): string {
  if (!date) return 'No date'
  
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)
  
  const diffTime = compareDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0) return `in ${diffDays} days`
  return `${Math.abs(diffDays)} days ago`
}

/**
 * Get start of day for consistent date comparisons
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get end of day for date range queries
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}
