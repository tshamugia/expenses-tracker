import { Elysia } from 'elysia'
import corsPlugin from './plugins/cors.plugin'
import jwtPlugin from './plugins/jwt.plugin'
import swaggerPlugin from './plugins/swagger.plugin'
import { bearer } from '@elysiajs/bearer'
import { rateLimitMiddleware } from './middleware/rate-limit'
import { authRoutes } from './routes/auth.routes'
import { currencyRoutes } from './routes/currency.routes'
import { settingsRoutes } from './routes/settings.routes'
import { categoryRoutes } from './routes/category.routes'
import { paymentCardRoutes } from './routes/payment-card.routes'
import { notificationRoutes } from './routes/notification.routes'
import { expenseRoutes } from './routes/expense.routes'
import { dashboardRoutes } from './routes/dashboard.routes'
import { fail, ERROR_CODES } from './utils/response'

const PORT = parseInt(process.env.API_PORT || '4000', 10)

const app = new Elysia()
  .use(corsPlugin)
  .use(rateLimitMiddleware())
  .use(jwtPlugin)
  .use(bearer())
  .use(swaggerPlugin)
  .onError(({ code, error, set }) => {
    switch (code) {
      case 'VALIDATION':
        set.status = 422
        return fail(error.message, ERROR_CODES.VALIDATION_ERROR)
      case 'NOT_FOUND':
        set.status = 404
        return fail('Route not found', ERROR_CODES.NOT_FOUND)
      case 'PARSE':
        set.status = 400
        return fail('Invalid request body', ERROR_CODES.VALIDATION_ERROR)
      default:
        console.error('Unhandled error:', error)
        set.status = 500
        return fail('Internal server error', ERROR_CODES.INTERNAL_ERROR)
    }
  })
  .get('/health', () => ({ status: 'ok' }), {
    detail: { tags: ['Health'], summary: 'Health check' },
  })
  .use(authRoutes)
  .use(currencyRoutes)
  .use(settingsRoutes)
  .use(categoryRoutes)
  .use(paymentCardRoutes)
  .use(notificationRoutes)
  .use(expenseRoutes)
  .use(dashboardRoutes)
  .listen(PORT)

console.log(`ExtraTracker API running on http://localhost:${PORT}`)

export type App = typeof app
