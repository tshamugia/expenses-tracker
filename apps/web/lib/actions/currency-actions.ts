'use server'

/**
 * Server Actions for Currency Operations
 * Handles fetching and caching currency rates from NBG API
 */

import { getMainCurrencyRates } from '@extracker/core'
import type { CurrencyRate } from '@extracker/types'

export interface CurrencyRatesResult {
  success: boolean
  data?: {
    usd: CurrencyRate | null
    eur: CurrencyRate | null
    date: string | null
  }
  error?: string
}

/**
 * Get current USD and EUR exchange rates
 * @returns Currency rates with success/error handling
 */
export async function getCurrencyRates(): Promise<CurrencyRatesResult> {
  try {
    const rates = await getMainCurrencyRates()

    if (!rates.usd || !rates.eur) {
      return {
        success: false,
        error: 'Failed to fetch currency rates from NBG API'
      }
    }

    return {
      success: true,
      data: rates
    }
  } catch (error) {
    console.error('Error in getCurrencyRates:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}
