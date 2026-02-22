import { Elysia, t } from 'elysia'
import { prisma } from '@extracker/db'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok, fail, ERROR_CODES } from '../utils/response'

const DEFAULT_SETTINGS = {
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: false,
  notifyBeforeDays: 3,
  theme: 'light',
  defaultCurrency: 'GEL',
  subscriptionPlan: 'free',
  subscriptionStatus: 'active',
}

export const settingsRoutes = new Elysia({ prefix: '/settings', name: 'routes/settings' })
  .use(authMiddleware)

  .get(
    '/',
    async ({ userId }) => {
      const prefs = await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...DEFAULT_SETTINGS },
        update: {},
      })
      return ok(prefs)
    },
    {
      detail: {
        tags: ['Settings'],
        summary: 'Get user settings (creates defaults if none exist)',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .patch(
    '/',
    async ({ userId, body, set }) => {
      // Validate theme
      if (body.theme && !['light', 'dark', 'system'].includes(body.theme)) {
        set.status = 422
        return fail('Invalid theme. Must be light, dark, or system', ERROR_CODES.VALIDATION_ERROR)
      }

      // Validate currency
      if (body.defaultCurrency && !['GEL', 'USD', 'EUR'].includes(body.defaultCurrency)) {
        set.status = 422
        return fail('Invalid currency. Must be GEL, USD, or EUR', ERROR_CODES.VALIDATION_ERROR)
      }

      // Validate notifyBeforeDays
      if (body.notifyBeforeDays !== undefined && (body.notifyBeforeDays < 1 || body.notifyBeforeDays > 30)) {
        set.status = 422
        return fail('notifyBeforeDays must be between 1 and 30', ERROR_CODES.VALIDATION_ERROR)
      }

      const prefs = await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...DEFAULT_SETTINGS, ...body },
        update: body,
      })

      return ok(prefs)
    },
    {
      body: t.Object({
        emailEnabled: t.Optional(t.Boolean()),
        smsEnabled: t.Optional(t.Boolean()),
        pushEnabled: t.Optional(t.Boolean()),
        notifyBeforeDays: t.Optional(t.Number({ minimum: 1, maximum: 30 })),
        theme: t.Optional(t.Union([t.Literal('light'), t.Literal('dark'), t.Literal('system')])),
        defaultCurrency: t.Optional(t.Union([t.Literal('GEL'), t.Literal('USD'), t.Literal('EUR')])),
      }),
      detail: {
        tags: ['Settings'],
        summary: 'Update user settings',
        security: [{ bearerAuth: [] }],
      },
    }
  )
