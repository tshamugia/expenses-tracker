/**
 * Currency Conversion Utilities
 * Helper functions for converting between currencies using NBG rates
 */

import type { CurrencyRate, Currency } from '@extracker/types'
import { getCurrencySymbol } from './currency.helpers'

/**
 * Convert amount from one currency to another using NBG rates
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @param usdRate - USD exchange rate from NBG
 * @param eurRate - EUR exchange rate from NBG
 * @returns Converted amount
 */
export function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  usdRate: CurrencyRate | null,
  eurRate: CurrencyRate | null
): number {
  // If same currency, no conversion needed
  if (fromCurrency === toCurrency) return amount

  // If rates not available, return original amount
  if (!usdRate || !eurRate) return amount

  // Convert to GEL first
  let gelAmount = amount
  if (fromCurrency === 'USD') {
    gelAmount = amount * usdRate.rate
  } else if (fromCurrency === 'EUR') {
    gelAmount = amount * eurRate.rate
  }

  // Convert from GEL to target currency
  if (toCurrency === 'GEL') {
    return gelAmount
  } else if (toCurrency === 'USD') {
    return gelAmount / usdRate.rate
  } else if (toCurrency === 'EUR') {
    return gelAmount / eurRate.rate
  }

  return amount
}

/**
 * Format amount with currency symbol and conversion note
 * @param amount - Original amount
 * @param expenseCurrency - Currency of the expense
 * @param displayCurrency - Currency to display in
 * @param usdRate - USD exchange rate
 * @param eurRate - EUR exchange rate
 * @returns Formatted string with original and converted amounts
 */
export function formatCurrencyWithConversion(
  amount: number,
  expenseCurrency: Currency,
  displayCurrency: Currency,
  usdRate: CurrencyRate | null,
  eurRate: CurrencyRate | null
): { main: string; conversion: string | null } {
  const expenseSymbol = getCurrencySymbol(expenseCurrency)
  const displaySymbol = getCurrencySymbol(displayCurrency)

  // If same currency, just format normally
  if (expenseCurrency === displayCurrency) {
    return {
      main: `${expenseSymbol}${amount.toFixed(2)}`,
      conversion: null
    }
  }

  // Convert amount
  const convertedAmount = convertCurrency(
    amount,
    expenseCurrency,
    displayCurrency,
    usdRate,
    eurRate
  )

  return {
    main: `${displaySymbol}${convertedAmount.toFixed(2)}`,
    conversion: `(${expenseSymbol}${amount.toFixed(2)})`
  }
}
