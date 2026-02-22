import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'

const swaggerPlugin = new Elysia({ name: 'plugin/swagger' }).use(
  swagger({
    path: '/swagger',
    documentation: {
      info: {
        title: 'ExtraTracker API',
        version: '0.1.0',
        description:
          'REST API for ExtraTracker expense tracking application. ' +
          'Provides authentication (JWT), expense CRUD, category management, ' +
          'payment card management, notifications, dashboard analytics, and currency rates. ' +
          'Used by the React Native mobile app via Eden Treaty.',
        contact: {
          name: 'ExtraTracker',
        },
      },
      tags: [
        { name: 'Health', description: 'Server health check' },
        { name: 'Auth', description: 'Registration, login, JWT token management, and password reset' },
        { name: 'Expenses', description: 'Create, read, update, delete expenses and mark payments as paid' },
        { name: 'Categories', description: 'User-defined expense categories with color coding' },
        { name: 'Payment Cards', description: 'Credit/debit card management with brand detection' },
        { name: 'Notifications', description: 'In-app notifications for payment reminders and overdue alerts' },
        { name: 'Dashboard', description: 'Aggregated statistics, upcoming expenses, and category breakdowns' },
        { name: 'Settings', description: 'User preferences: theme, currency, notification settings' },
        { name: 'Currency', description: 'Live GEL/USD/EUR exchange rates from National Bank of Georgia' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token. Obtain via POST /auth/login or /auth/register.',
          },
        },
      },
    },
  })
)

export default swaggerPlugin
