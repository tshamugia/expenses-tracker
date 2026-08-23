/**
 * Default expense categories (Phase 1, PRD R5 — minimalism: 5–8 is enough).
 * Seeded only for users who have no categories yet; existing users are untouched.
 * Names come from the message catalogs, so a user gets them in the UI language
 * that was active when their account was first seeded.
 */

import prisma from '@/lib/db/prisma'
import { getServerTranslator } from '@/i18n/server-translator'

export const DEFAULT_CATEGORY_DEFS = [
  { key: 'food', color: '#10b981', kind: 'VARIABLE' },
  { key: 'transport', color: '#f59e0b', kind: 'VARIABLE' },
  { key: 'housing', color: '#3b82f6', kind: 'FIXED' },
  { key: 'subscriptions', color: '#8b5cf6', kind: 'FIXED' },
  { key: 'health', color: '#ec4899', kind: 'VARIABLE' },
  { key: 'entertainment', color: '#ef4444', kind: 'VARIABLE' },
  { key: 'other', color: '#6b7280', kind: 'VARIABLE' },
] as const

/**
 * Seed default categories for a user who has none yet.
 * Safe to call on every page load — no-op when the user already has categories.
 */
export async function ensureDefaultCategories(userId: string): Promise<void> {
  const count = await prisma.category.count({ where: { userId } })
  if (count > 0) return

  const t = await getServerTranslator('DefaultCategories')

  await prisma.category.createMany({
    data: DEFAULT_CATEGORY_DEFS.map((c) => ({
      userId,
      categoryName: t(c.key),
      color: c.color,
      kind: c.kind,
    })),
    skipDuplicates: true,
  })
}
