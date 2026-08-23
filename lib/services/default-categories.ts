/**
 * Default expense categories (Phase 1, PRD R5 — minimalism: 5–8 is enough).
 * Seeded only for users who have no categories yet; existing users are untouched.
 */

import prisma from '@/lib/db/prisma'

export const DEFAULT_CATEGORIES = [
  { categoryName: 'კვება', color: '#10b981', kind: 'VARIABLE' },
  { categoryName: 'ტრანსპორტი', color: '#f59e0b', kind: 'VARIABLE' },
  { categoryName: 'ბინა/კომუნალური', color: '#3b82f6', kind: 'FIXED' },
  { categoryName: 'გამოწერები', color: '#8b5cf6', kind: 'FIXED' },
  { categoryName: 'ჯანმრთელობა', color: '#ec4899', kind: 'VARIABLE' },
  { categoryName: 'გართობა', color: '#ef4444', kind: 'VARIABLE' },
  { categoryName: 'სხვა', color: '#6b7280', kind: 'VARIABLE' },
] as const

/**
 * Seed default categories for a user who has none yet.
 * Safe to call on every page load — no-op when the user already has categories.
 */
export async function ensureDefaultCategories(userId: string): Promise<void> {
  const count = await prisma.category.count({ where: { userId } })
  if (count > 0) return

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ userId, ...c })),
    skipDuplicates: true,
  })
}
