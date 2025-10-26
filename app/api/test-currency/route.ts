/**
 * Test endpoint for currency API
 * Visit /api/test-currency to test NBG API integration
 */

import { NextResponse } from 'next/server'
import { getMainCurrencyRates } from '@/lib/services/currency'

export async function GET() {
  try {
    const rates = await getMainCurrencyRates()

    if (!rates.usd || !rates.eur) {
      return NextResponse.json(
        { error: 'Failed to fetch currency rates' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        date: rates.date,
        usd: {
          code: rates.usd.code,
          name: rates.usd.name,
          rate: rates.usd.rate,
          rateFormated: rates.usd.rateFormated,
          diff: rates.usd.diff,
          diffFormated: rates.usd.diffFormated
        },
        eur: {
          code: rates.eur.code,
          name: rates.eur.name,
          rate: rates.eur.rate,
          rateFormated: rates.eur.rateFormated,
          diff: rates.eur.diff,
          diffFormated: rates.eur.diffFormated
        }
      }
    })
  } catch (error) {
    console.error('Error in test-currency endpoint:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
