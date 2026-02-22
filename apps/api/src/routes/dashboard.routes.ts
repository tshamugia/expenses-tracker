import { Elysia } from 'elysia'
import { findExpensesByUserId } from '@extracker/db'
import { isOverdue, DASHBOARD_RECENT_LIMIT } from '@extracker/core'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok } from '../utils/response'

import type { ExpenseListItem, DashboardStats, CategoryData } from '@extracker/types'

export const dashboardRoutes = new Elysia({ prefix: '/dashboard', name: 'routes/dashboard' })
  .use(authMiddleware)

  .get(
    '/',
    async ({ userId }) => {
      const allExpenses = await findExpensesByUserId(userId)

      const now = new Date()
      now.setHours(0, 0, 0, 0)

      const thirtyDaysFromNow = new Date(now)
      thirtyDaysFromNow.setDate(now.getDate() + 30)

      // Build expense list items
      const expenseItems: ExpenseListItem[] = allExpenses.map((e) => {
        const latestPayment = e.payments[0] || null
        const isPaid = latestPayment?.paid ?? false
        const expenseIsOverdue = !isPaid && isOverdue(e.nextDueDate)

        return {
          id: e.id,
          title: e.title,
          amount: Number(e.amount),
          currency: e.currency,
          category: e.category,
          nextDueDate: e.nextDueDate,
          isOverdue: expenseIsOverdue,
          isPaid,
          isRecurring: e.isRecurring,
          paymentCard: e.paymentCard
            ? {
                id: e.paymentCard.id,
                nickname: e.paymentCard.nickname,
                lastFourDigits: e.paymentCard.lastFourDigits,
                cardBrand: e.paymentCard.cardBrand,
                color: e.paymentCard.color,
              }
            : null,
        }
      })

      // Stats
      const stats: DashboardStats = {
        total: 0,
        paid: 0,
        pending: 0,
        overdue: 0,
        count: expenseItems.length,
      }

      for (const item of expenseItems) {
        stats.total += item.amount
        if (item.isPaid) {
          stats.paid += item.amount
        } else if (item.isOverdue) {
          stats.overdue += item.amount
        } else {
          stats.pending += item.amount
        }
      }

      // Round to 2 decimal places
      stats.total = Math.round(stats.total * 100) / 100
      stats.paid = Math.round(stats.paid * 100) / 100
      stats.pending = Math.round(stats.pending * 100) / 100
      stats.overdue = Math.round(stats.overdue * 100) / 100

      // Recent expenses (last N)
      const recentExpenses = expenseItems.slice(0, DASHBOARD_RECENT_LIMIT)

      // Upcoming expenses: next 30 days, not paid, not overdue
      const upcomingExpenses = expenseItems
        .filter((e) => {
          if (e.isPaid || e.isOverdue || !e.nextDueDate) return false
          const due = new Date(e.nextDueDate)
          return due >= now && due <= thirtyDaysFromNow
        })
        .slice(0, 5)

      // Category breakdown
      const categoryMap = new Map<string, { amount: number; count: number }>()
      for (const item of expenseItems) {
        const cat = item.category || 'Uncategorized'
        const existing = categoryMap.get(cat) || { amount: 0, count: 0 }
        existing.amount += item.amount
        existing.count += 1
        categoryMap.set(cat, existing)
      }

      const categoryData: CategoryData[] = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          amount: Math.round(data.amount * 100) / 100,
          count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount)

      return ok({
        expenses: recentExpenses,
        stats,
        upcomingExpenses,
        categoryData,
      })
    },
    {
      detail: {
        tags: ['Dashboard'],
        summary: 'Get dashboard data (stats, recent expenses, upcoming, categories)',
        description: 'Returns aggregated statistics (total, paid, pending, overdue amounts), recent expenses, upcoming expenses (next 30 days), and category breakdown.',
        security: [{ bearerAuth: [] }],
      },
    }
  )
