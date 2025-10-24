/**
 * Application Configuration
 * Centralized configuration for the entire app
 */

// Demo User ID (matches the user in database)
// This user has sample expenses for testing
export const DEMO_USER_ID = '2e1562f2-dedb-400a-9bc0-a1b647e26e32'

// App Settings
export const APP_NAME = 'ExTracker'
export const APP_DESCRIPTION = 'Track your expenses and payments with ease'

// Currency Settings
export const DEFAULT_CURRENCY = 'USD'
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY'] as const

// Notification Settings
export const DEFAULT_NOTIFY_BEFORE_DAYS = 3

// Pagination
export const EXPENSES_PER_PAGE = 20
export const DASHBOARD_RECENT_LIMIT = 10

// Date Formats
export const DATE_FORMAT = 'MMM dd, yyyy'
export const DATE_TIME_FORMAT = 'MMM dd, yyyy HH:mm'
