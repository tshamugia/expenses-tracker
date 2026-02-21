/**
 * Currency formatting utilities
 * Provides consistent currency display across the application
 */

// Supported currencies with their symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  GEL: '₾',
  INR: '₹',
  CAD: 'CA$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  KRW: '₩',
}

/**
 * Format amount as currency with proper symbol and decimals
 */
export function formatCurrency(
  amount: number | string,
  currency: string = 'GEL'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numAmount)
  } catch {
    // Fallback if currency code is invalid
    const symbol = getCurrencySymbol(currency)
    return `${symbol}${numAmount.toFixed(2)}`
  }
}

/**
 * Get currency symbol for a given currency code
 */
export function getCurrencySymbol(currency: string = 'GEL'): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || currency
}

/**
 * Format amount without currency symbol (just number)
 */
export function formatAmount(amount: number | string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount)
}

/**
 * Parse currency string to number (removes symbols and formatting)
 */
export function parseCurrency(value: string): number {
  // Remove all non-numeric characters except decimal point and minus
  const cleaned = value.replace(/[^\d.-]/g, '')
  return parseFloat(cleaned) || 0
}

/**
 * Format large amounts with K/M suffix
 */
export function formatCompactCurrency(
  amount: number | string,
  currency: string = 'GEL'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const symbol = getCurrencySymbol(currency)

  if (numAmount >= 1000000) {
    return `${symbol}${(numAmount / 1000000).toFixed(1)}M`
  }
  if (numAmount >= 1000) {
    return `${symbol}${(numAmount / 1000).toFixed(1)}K`
  }
  return `${symbol}${numAmount.toFixed(2)}`
}
