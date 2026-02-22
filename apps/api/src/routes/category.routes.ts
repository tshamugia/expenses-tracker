import { Elysia, t } from 'elysia'
import { prisma } from '@extracker/db'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok, fail, ERROR_CODES } from '../utils/response'

export const categoryRoutes = new Elysia({ prefix: '/categories', name: 'routes/categories' })
  .use(authMiddleware)

  .get(
    '/',
    async ({ userId, query }) => {
      const page = Math.max(1, query.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50))
      const skip = (page - 1) * pageSize

      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.category.count({ where: { userId } }),
      ])

      return ok({
        data: categories,
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
        tags: ['Categories'],
        summary: 'List all categories (paginated)',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .get(
    '/:id',
    async ({ userId, params, set }) => {
      const category = await prisma.category.findFirst({
        where: { id: params.id, userId },
      })

      if (!category) {
        set.status = 404
        return fail('Category not found', ERROR_CODES.NOT_FOUND)
      }

      return ok(category)
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Categories'],
        summary: 'Get a single category',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .post(
    '/',
    async ({ userId, body, set }) => {
      const name = body.categoryName.trim()

      if (name.length < 1 || name.length > 50) {
        set.status = 422
        return fail('Category name must be 1-50 characters', ERROR_CODES.VALIDATION_ERROR)
      }

      // Case-insensitive uniqueness check
      const existing = await prisma.category.findFirst({
        where: {
          userId,
          categoryName: { equals: name, mode: 'insensitive' },
        },
      })

      if (existing) {
        set.status = 409
        return fail('A category with this name already exists', ERROR_CODES.CONFLICT)
      }

      const category = await prisma.category.create({
        data: {
          userId,
          categoryName: name,
          color: body.color || '#3b82f6',
        },
      })

      set.status = 201
      return ok(category)
    },
    {
      body: t.Object({
        categoryName: t.String({ minLength: 1, maxLength: 50 }),
        color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
      }),
      detail: {
        tags: ['Categories'],
        summary: 'Create a new category',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .patch(
    '/:id',
    async ({ userId, params, body, set }) => {
      const category = await prisma.category.findFirst({
        where: { id: params.id, userId },
      })

      if (!category) {
        set.status = 404
        return fail('Category not found', ERROR_CODES.NOT_FOUND)
      }

      const updateData: Record<string, unknown> = {}

      if (body.categoryName !== undefined) {
        const name = body.categoryName.trim()
        if (name.length < 1 || name.length > 50) {
          set.status = 422
          return fail('Category name must be 1-50 characters', ERROR_CODES.VALIDATION_ERROR)
        }

        // Case-insensitive uniqueness check excluding self
        const existing = await prisma.category.findFirst({
          where: {
            userId,
            id: { not: params.id },
            categoryName: { equals: name, mode: 'insensitive' },
          },
        })

        if (existing) {
          set.status = 409
          return fail('A category with this name already exists', ERROR_CODES.CONFLICT)
        }

        updateData.categoryName = name
      }

      if (body.color !== undefined) {
        updateData.color = body.color
      }

      const updated = await prisma.category.update({
        where: { id: params.id },
        data: updateData,
      })

      return ok(updated)
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        categoryName: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
        color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
      }),
      detail: {
        tags: ['Categories'],
        summary: 'Update a category',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .delete(
    '/:id',
    async ({ userId, params, set }) => {
      const category = await prisma.category.findFirst({
        where: { id: params.id, userId },
      })

      if (!category) {
        set.status = 404
        return fail('Category not found', ERROR_CODES.NOT_FOUND)
      }

      // Block deletion if expenses reference this category name
      const expenseCount = await prisma.expense.count({
        where: { userId, category: category.categoryName },
      })

      if (expenseCount > 0) {
        set.status = 409
        return fail(
          `Cannot delete category. ${expenseCount} expense${expenseCount > 1 ? 's' : ''} still use this category.`,
          ERROR_CODES.CONFLICT
        )
      }

      await prisma.category.delete({ where: { id: params.id } })

      set.status = 204
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Categories'],
        summary: 'Delete a category (blocked if expenses exist)',
        description: 'Deletes a category. Returns 409 if any expenses still reference this category name.',
        security: [{ bearerAuth: [] }],
      },
    }
  )
