/**
 * Currency Service
 * Fetches exchange rates from National Bank of Georgia API
 */

import type { CurrencyRate, NBGApiResponse } from '@extracker/types'

/**
 * Fetch currency rates from NBG API for a specific date
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns Currency rates data
 */
export async function fetchCurrencyRates(
  date?: string
): Promise<NBGApiResponse | null> {
  try {
    // Use provided date or today's date
    const targetDate = date || new Date().toISOString().split('T')[0]

    const url = `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json/?date=${targetDate}`

    const response = await fetch(url)

    if (!response.ok) {
      console.error('Failed to fetch currency rates:', response.statusText)
      return null
    }

    const data = await response.json()
    return data[0] as NBGApiResponse
  } catch (error) {
    console.error('Error fetching currency rates:', error)
    return null
  }
}

/**
 * Get specific currency rates (USD and EUR)
 * @param date - Optional date in YYYY-MM-DD format
 * @returns Object with USD and EUR rates
 */
export async function getMainCurrencyRates(date?: string) {
  const data = await fetchCurrencyRates(date)

  if (!data) {
    return {
      usd: null,
      eur: null,
      date: null
    }
  }

  const usd = data.currencies.find(c => c.code === 'USD')
  const eur = data.currencies.find(c => c.code === 'EUR')

  return {
    usd: usd || null,
    eur: eur || null,
    date: data.date
  }
}

/**
 * Convert amount from GEL to another currency
 * @param amount - Amount in GEL
 * @param rate - Exchange rate from NBG
 * @returns Converted amount
 */
export function convertFromGEL(amount: number, rate: CurrencyRate): number {
  return amount / rate.rate
}

/**
 * Convert amount from another currency to GEL
 * @param amount - Amount in foreign currency
 * @param rate - Exchange rate from NBG
 * @returns Converted amount in GEL
 */
export function convertToGEL(amount: number, rate: CurrencyRate): number {
  return amount * rate.rate
}
