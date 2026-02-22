import { Elysia, t } from 'elysia'
import { prisma } from '@extracker/db'
import { validateCardNumber, getLastFourDigits, validateExpiryDate, detectCardBrand } from '@extracker/core'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok, fail, ERROR_CODES } from '../utils/response'

export const paymentCardRoutes = new Elysia({ prefix: '/payment-cards', name: 'routes/payment-cards' })
  .use(authMiddleware)

  .get(
    '/',
    async ({ userId, query }) => {
      const page = Math.max(1, query.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50))
      const skip = (page - 1) * pageSize

      const [cards, total] = await Promise.all([
        prisma.paymentCard.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.paymentCard.count({ where: { userId } }),
      ])

      return ok({
        data: cards,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      })
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        pageSize: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      detail: {
        tags: ['Payment Cards'],
        summary: 'List all payment cards (paginated)',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .get(
    '/:id',
    async ({ userId, params, set }) => {
      const card = await prisma.paymentCard.findFirst({
        where: { id: params.id, userId },
        include: { _count: { select: { expenses: true } } },
      })

      if (!card) {
        set.status = 404
        return fail('Payment card not found', ERROR_CODES.NOT_FOUND)
      }

      return ok(card)
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Payment Cards'],
        summary: 'Get a single payment card with expense count',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .post(
    '/',
    async ({ userId, body, set }) => {
      // Validate card number
      const validation = validateCardNumber(body.cardNumber)
      if (!validation.isValid) {
        set.status = 422
        return fail(validation.error || 'Invalid card number', ERROR_CODES.VALIDATION_ERROR)
      }

      // Validate expiry date
      if (!validateExpiryDate(body.expiryMonth, body.expiryYear)) {
        set.status = 422
        return fail('Card is expired or expiry date is invalid', ERROR_CODES.VALIDATION_ERROR)
      }

      const lastFourDigits = getLastFourDigits(body.cardNumber)
      const cardBrand = detectCardBrand(body.cardNumber)

      const card = await prisma.paymentCard.create({
        data: {
          userId,
          cardholderName: body.cardholderName.trim(),
          lastFourDigits,
          expiryMonth: body.expiryMonth,
          expiryYear: body.expiryYear,
          cardBrand,
          nickname: body.nickname?.trim() || null,
          color: body.color || '#1e40af',
        },
      })

      set.status = 201
      return ok(card)
    },
    {
      body: t.Object({
        cardholderName: t.String({ minLength: 1, maxLength: 100 }),
        cardNumber: t.String({ minLength: 13, maxLength: 19 }),
        expiryMonth: t.Integer({ minimum: 1, maximum: 12 }),
        expiryYear: t.Integer({ minimum: 2000, maximum: 2100 }),
        nickname: t.Optional(t.String({ maxLength: 50 })),
        color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
      }),
      detail: {
        tags: ['Payment Cards'],
        summary: 'Add a new payment card',
        description: 'Validates the card number (Luhn check), detects brand, and stores only the last 4 digits. The full card number is never saved.',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .patch(
    '/:id',
    async ({ userId, params, body, set }) => {
      const card = await prisma.paymentCard.findFirst({
        where: { id: params.id, userId },
      })

      if (!card) {
        set.status = 404
        return fail('Payment card not found', ERROR_CODES.NOT_FOUND)
      }

      // If expiry is being updated, validate
      const expiryMonth = body.expiryMonth ?? card.expiryMonth
      const expiryYear = body.expiryYear ?? card.expiryYear
      if (body.expiryMonth !== undefined || body.expiryYear !== undefined) {
        if (!validateExpiryDate(expiryMonth, expiryYear)) {
          set.status = 422
          return fail('Card is expired or expiry date is invalid', ERROR_CODES.VALIDATION_ERROR)
        }
      }

      const updateData: Record<string, unknown> = {}
      if (body.cardholderName !== undefined) updateData.cardholderName = body.cardholderName.trim()
      if (body.expiryMonth !== undefined) updateData.expiryMonth = body.expiryMonth
      if (body.expiryYear !== undefined) updateData.expiryYear = body.expiryYear
      if (body.nickname !== undefined) updateData.nickname = body.nickname.trim() || null
      if (body.color !== undefined) updateData.color = body.color

      const updated = await prisma.paymentCard.update({
        where: { id: params.id },
        data: updateData,
      })

      return ok(updated)
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        cardholderName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        expiryMonth: t.Optional(t.Integer({ minimum: 1, maximum: 12 })),
        expiryYear: t.Optional(t.Integer({ minimum: 2000, maximum: 2100 })),
        nickname: t.Optional(t.String({ maxLength: 50 })),
        color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
      }),
      detail: {
        tags: ['Payment Cards'],
        summary: 'Update a payment card (no card number changes)',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .delete(
    '/:id',
    async ({ userId, params, set }) => {
      const card = await prisma.paymentCard.findFirst({
        where: { id: params.id, userId },
      })

      if (!card) {
        set.status = 404
        return fail('Payment card not found', ERROR_CODES.NOT_FOUND)
      }

      // Prisma onDelete: SetNull handles expense FK automatically
      await prisma.paymentCard.delete({ where: { id: params.id } })

      set.status = 204
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Payment Cards'],
        summary: 'Delete a payment card',
        description: 'Deletes the card. Expenses linked to this card have their paymentCardId set to null.',
        security: [{ bearerAuth: [] }],
      },
    }
  )
