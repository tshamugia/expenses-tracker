import { Elysia } from 'elysia'
import { getMainCurrencyRates } from '@extracker/core'
import { ok, fail, ERROR_CODES } from '../utils/response'

export const currencyRoutes = new Elysia({ prefix: '/currency', name: 'routes/currency' })

  .get(
    '/rates',
    async ({ set }) => {
      try {
        const rates = await getMainCurrencyRates()
        return ok(rates)
      } catch (error) {
        console.error('Error fetching currency rates:', error)
        set.status = 500
        return fail('Failed to fetch currency rates', ERROR_CODES.INTERNAL_ERROR)
      }
    },
    {
      detail: { tags: ['Currency'], summary: 'Get current currency rates (USD, EUR vs GEL)' },
    }
  )
