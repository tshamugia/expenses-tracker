import { Elysia, t } from 'elysia'
import { prisma, findExpensesWithFilters, findExpenseById } from '@extracker/db'
import { EXPENSES_PER_PAGE } from '@extracker/core'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok, fail, ERROR_CODES } from '../utils/response'
import { notifyPastOrOverdueExpense } from '../utils/notification'

import type { ExpenseWithRelationsData } from '@extracker/types'

function serializeExpense(expense: ExpenseWithRelationsData) {
  return {
    ...expense,
    amount: Number(expense.amount),
    payments: expense.payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
    })),
  }
}

export const expenseRoutes = new Elysia({ prefix: '/expenses', name: 'routes/expenses' })
  .use(authMiddleware)

  .get(
    '/',
    async ({ userId, query }) => {
      const page = Math.max(1, query.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, query.pageSize ?? EXPENSES_PER_PAGE))

      const filters: {
        category?: string
        isRecurring?: boolean
        startDate?: Date
        endDate?: Date
      } = {}

      if (query.category) filters.category = query.category
      if (query.isRecurring !== undefined) filters.isRecurring = query.isRecurring
      if (query.startDate) filters.startDate = new Date(query.startDate)
      if (query.endDate) filters.endDate = new Date(query.endDate)

      const allExpenses = await findExpensesWithFilters(userId, filters)

      // In-memory pagination
      const total = allExpenses.length
      const start = (page - 1) * pageSize
      const paginatedExpenses = allExpenses.slice(start, start + pageSize)

      return ok({
        data: paginatedExpenses.map(serializeExpense),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      })
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
        isRecurring: t.Optional(t.Boolean()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        page: t.Optional(t.Number({ minimum: 1 })),
        pageSize: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      detail: {
        tags: ['Expenses'],
        summary: 'List expenses with filters and pagination',
        description: 'Returns paginated expenses for the authenticated user. Supports filtering by category, recurring status, and date range.',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .get(
    '/:id',
    async ({ userId, params, set }) => {
      const expense = await findExpenseById(params.id)

      if (!expense || expense.userId !== userId) {
        set.status = 404
        return fail('Expense not found', ERROR_CODES.NOT_FOUND)
      }

      return ok(serializeExpense(expense))
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Expenses'],
        summary: 'Get a single expense with payments',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .post(
    '/',
    async ({ userId, body, set }) => {
      const expenseData: Record<string, unknown> = {
        userId,
        title: body.title.trim(),
        amount: body.amount,
        currency: body.currency || 'GEL',
        description: body.description?.trim() || null,
        category: body.category?.trim() || null,
        isRecurring: body.isRecurring || false,
        recurrenceRule: body.recurrenceRule || null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
        paymentCardId: body.paymentCardId || null,
      }

      // Verify payment card belongs to user if provided
      if (body.paymentCardId) {
        const card = await prisma.paymentCard.findFirst({
          where: { id: body.paymentCardId, userId },
        })
        if (!card) {
          set.status = 404
          return fail('Payment card not found', ERROR_CODES.NOT_FOUND)
        }
      }

      const expense = await prisma.expense.create({
        data: expenseData as Parameters<typeof prisma.expense.create>[0]['data'],
        include: {
          payments: true,
          paymentCard: true,
        },
      })

      // Create initial payment if nextDueDate is provided
      if (body.nextDueDate) {
        const newPayment = await prisma.payment.create({
          data: {
            expenseId: expense.id,
            dueDate: new Date(body.nextDueDate),
            amount: body.amount,
          },
        })

        // Notify if due date is past or today
        const dueDate = new Date(body.nextDueDate)
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const dueDateNorm = new Date(dueDate)
        dueDateNorm.setHours(0, 0, 0, 0)

        if (dueDateNorm <= now) {
          await notifyPastOrOverdueExpense(
            userId,
            body.title.trim(),
            dueDate,
            body.amount,
            body.currency || 'GEL',
            newPayment.id,
            expense.id
          )
        }
      }

      // Re-fetch with relations for consistent response
      const created = await findExpenseById(expense.id)

      set.status = 201
      return ok(serializeExpense(created!))
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
        amount: t.Number({ minimum: 0.01, maximum: 999999999.99 }),
        currency: t.Optional(t.Union([t.Literal('GEL'), t.Literal('USD'), t.Literal('EUR')])),
        description: t.Optional(t.String({ maxLength: 1000 })),
        category: t.Optional(t.String({ maxLength: 100 })),
        isRecurring: t.Optional(t.Boolean()),
        recurrenceRule: t.Optional(t.String({ maxLength: 255 })),
        startDate: t.Optional(t.String({ format: 'date-time' })),
        nextDueDate: t.Optional(t.String({ format: 'date-time' })),
        paymentCardId: t.Optional(t.String({ format: 'uuid' })),
      }),
      detail: {
        tags: ['Expenses'],
        summary: 'Create a new expense',
        description: 'Creates an expense and optionally an initial payment. If nextDueDate is past or today, an overdue notification is sent.',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .patch(
    '/:id',
    async ({ userId, params, body, set }) => {
      const existing = await prisma.expense.findFirst({
        where: { id: params.id, userId },
      })

      if (!existing) {
        set.status = 404
        return fail('Expense not found', ERROR_CODES.NOT_FOUND)
      }

      // Verify payment card belongs to user if provided
      if (body.paymentCardId) {
        const card = await prisma.paymentCard.findFirst({
          where: { id: body.paymentCardId, userId },
        })
        if (!card) {
          set.status = 404
          return fail('Payment card not found', ERROR_CODES.NOT_FOUND)
        }
      }

      const updateData: Record<string, unknown> = {}
      if (body.title !== undefined) updateData.title = body.title.trim()
      if (body.amount !== undefined) updateData.amount = body.amount
      if (body.currency !== undefined) updateData.currency = body.currency
      if (body.description !== undefined) updateData.description = body.description.trim() || null
      if (body.category !== undefined) updateData.category = body.category.trim() || null
      if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring
      if (body.recurrenceRule !== undefined) updateData.recurrenceRule = body.recurrenceRule || null
      if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null
      if (body.nextDueDate !== undefined) updateData.nextDueDate = body.nextDueDate ? new Date(body.nextDueDate) : null
      if (body.paymentCardId !== undefined) updateData.paymentCardId = body.paymentCardId || null

      await prisma.expense.update({
        where: { id: params.id },
        data: updateData,
      })

      const updated = await findExpenseById(params.id)
      return ok(serializeExpense(updated!))
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        amount: t.Optional(t.Number({ minimum: 0.01, maximum: 999999999.99 })),
        currency: t.Optional(t.Union([t.Literal('GEL'), t.Literal('USD'), t.Literal('EUR')])),
        description: t.Optional(t.String({ maxLength: 1000 })),
        category: t.Optional(t.String({ maxLength: 100 })),
        isRecurring: t.Optional(t.Boolean()),
        recurrenceRule: t.Optional(t.String({ maxLength: 255 })),
        startDate: t.Optional(t.Nullable(t.String({ format: 'date-time' }))),
        nextDueDate: t.Optional(t.Nullable(t.String({ format: 'date-time' }))),
        paymentCardId: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
      }),
      detail: {
        tags: ['Expenses'],
        summary: 'Update an expense',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .delete(
    '/:id',
    async ({ userId, params, set }) => {
      const expense = await prisma.expense.findFirst({
        where: { id: params.id, userId },
      })

      if (!expense) {
        set.status = 404
        return fail('Expense not found', ERROR_CODES.NOT_FOUND)
      }

      // Prisma cascade deletes related Payments automatically
      await prisma.expense.delete({ where: { id: params.id } })

      set.status = 204
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Expenses'],
        summary: 'Delete an expense',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .post(
    '/:id/mark-paid',
    async ({ userId, params, set }) => {
      const expense = await prisma.expense.findFirst({
        where: { id: params.id, userId },
        include: {
          payments: {
            where: { paid: false },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
        },
      })

      if (!expense) {
        set.status = 404
        return fail('Expense not found', ERROR_CODES.NOT_FOUND)
      }

      if (expense.payments.length === 0) {
        set.status = 422
        return fail('No unpaid payments found for this expense', ERROR_CODES.VALIDATION_ERROR)
      }

      const payment = expense.payments[0]

      await prisma.payment.update({
        where: { id: payment.id },
        data: { paid: true, paidAt: new Date() },
      })

      const updated = await findExpenseById(params.id)
      return ok(serializeExpense(updated!))
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Expenses'],
        summary: 'Mark earliest unpaid payment as paid',
        description: 'Finds the earliest unpaid payment for this expense and marks it as paid with the current timestamp.',
        security: [{ bearerAuth: [] }],
      },
    }
  )
