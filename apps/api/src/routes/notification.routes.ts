import { Elysia, t } from 'elysia'
import { prisma } from '@extracker/db'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok, fail, ERROR_CODES } from '../utils/response'

export const notificationRoutes = new Elysia({ prefix: '/notifications', name: 'routes/notifications' })
  .use(authMiddleware)

  // ─── Static routes BEFORE /:id to avoid param conflicts ─────────

  .get(
    '/stats',
    async ({ userId }) => {
      const [total, unread] = await Promise.all([
        prisma.notification.count({ where: { userId } }),
        prisma.notification.count({ where: { userId, isRead: false } }),
      ])
      return ok({ total, unread })
    },
    {
      detail: {
        tags: ['Notifications'],
        summary: 'Get notification counts (total and unread)',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .post(
    '/read-all',
    async ({ userId }) => {
      const result = await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      })
      return ok({ updated: result.count })
    },
    {
      detail: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .delete(
    '/read',
    async ({ userId, set }) => {
      await prisma.notification.deleteMany({
        where: { userId, isRead: true },
      })
      set.status = 204
    },
    {
      detail: {
        tags: ['Notifications'],
        summary: 'Delete all read notifications',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ─── Paginated list ─────────────────────────────────────────────

  .get(
    '/',
    async ({ userId, query }) => {
      const page = Math.max(1, query.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
      const skip = (page - 1) * pageSize

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.notification.count({ where: { userId } }),
      ])

      return ok({
        data: notifications,
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
        tags: ['Notifications'],
        summary: 'List notifications (paginated)',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ─── Single notification routes ─────────────────────────────────

  .get(
    '/:id',
    async ({ userId, params, set }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, userId },
      })

      if (!notification) {
        set.status = 404
        return fail('Notification not found', ERROR_CODES.NOT_FOUND)
      }

      return ok(notification)
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Notifications'],
        summary: 'Get a single notification',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .patch(
    '/:id/read',
    async ({ userId, params, set }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, userId },
      })

      if (!notification) {
        set.status = 404
        return fail('Notification not found', ERROR_CODES.NOT_FOUND)
      }

      const updated = await prisma.notification.update({
        where: { id: params.id },
        data: { isRead: true },
      })

      return ok(updated)
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Notifications'],
        summary: 'Mark a notification as read',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .delete(
    '/:id',
    async ({ userId, params, set }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, userId },
      })

      if (!notification) {
        set.status = 404
        return fail('Notification not found', ERROR_CODES.NOT_FOUND)
      }

      await prisma.notification.delete({ where: { id: params.id } })

      set.status = 204
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Notifications'],
        summary: 'Delete a single notification',
        security: [{ bearerAuth: [] }],
      },
    }
  )
