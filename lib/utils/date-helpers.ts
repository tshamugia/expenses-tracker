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
 * Supported recurrence frequencies (parsed from an RRULE string)
 */
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

/**
 * Parse a recurrence rule string (e.g. "RRULE:FREQ=MONTHLY;INTERVAL=1")
 * Returns null if the rule is missing or unrecognized.
 */
export function parseRecurrenceRule(
  rule: string | null | undefined
): { frequency: RecurrenceFrequency; interval: number } | null {
  if (!rule) return null

  const freqMatch = rule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i)
  if (!freqMatch) return null

  const frequency = freqMatch[1].toUpperCase() as RecurrenceFrequency

  const intervalMatch = rule.match(/INTERVAL=(\d+)/i)
  const interval = intervalMatch ? Math.max(1, parseInt(intervalMatch[1], 10)) : 1

  return { frequency, interval }
}

/**
 * Build an RRULE string from a frequency and interval.
 */
export function buildRecurrenceRule(
  frequency: RecurrenceFrequency,
  interval: number = 1
): string {
  return `RRULE:FREQ=${frequency};INTERVAL=${Math.max(1, interval)}`
}

/**
 * Compute the next due date for a recurring expense.
 * Advances `currentDueDate` by one recurrence interval.
 *
 * Handles month-length edge cases: a payment due on the 31st that rolls into a
 * shorter month is clamped to that month's last day (e.g. Jan 31 → Feb 28/29)
 * instead of overflowing into the following month.
 *
 * Returns null if the rule cannot be parsed (caller should treat as non-recurring).
 */
export function getNextDueDate(
  currentDueDate: Date,
  recurrenceRule: string | null | undefined
): Date | null {
  const parsed = parseRecurrenceRule(recurrenceRule)
  if (!parsed) return null

  const { frequency, interval } = parsed
  const next = new Date(currentDueDate)

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + interval)
      break
    case 'WEEKLY':
      next.setDate(next.getDate() + 7 * interval)
      break
    case 'MONTHLY': {
      const targetDay = currentDueDate.getDate()
      // Move to the first of the target month to avoid setMonth overflow,
      // then clamp the day to the target month's length.
      next.setDate(1)
      next.setMonth(next.getMonth() + interval)
      const daysInMonth = new Date(
        next.getFullYear(),
        next.getMonth() + 1,
        0
      ).getDate()
      next.setDate(Math.min(targetDay, daysInMonth))
      break
    }
    case 'YEARLY': {
      const targetDay = currentDueDate.getDate()
      next.setDate(1)
      next.setFullYear(next.getFullYear() + interval)
      const daysInMonth = new Date(
        next.getFullYear(),
        next.getMonth() + 1,
        0
      ).getDate()
      next.setDate(Math.min(targetDay, daysInMonth))
      break
    }
  }

  return next
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
