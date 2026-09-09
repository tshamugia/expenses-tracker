'use server'

/**
 * Server Actions for Categories
 * BUSINESS LOGIC LAYER — orchestration only (auth/ownership → service →
 * revalidate). The userId-first logic lives in lib/services/category-service.ts
 * and is shared with the MCP tools.
 */

import { revalidatePath } from 'next/cache'
import { cache } from 'react'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import {
  createCategoryForUser,
  deleteCategoryForUser,
  serializeCategory,
  updateCategoryForUser,
} from '@/lib/services/category-service'
import { ensureDefaultCategories } from '@/lib/services/default-categories'
import { toActionResult } from '@/lib/services/outcome'
import { computeCategorySpendStatuses } from '@/lib/services/spend-status-service'
import type {
  SerializedCategory,
  CategoryWithSpend,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryActionResult,
} from '@/types/category-types'

function revalidateCategoryPages(): void {
  revalidatePath('/categories')
  revalidatePath('/expenses')
  revalidatePath('/dashboard')
}

/**
 * Get all categories for a user
 * Business logic: Fetch and sort by creation date
 */
export const getUserCategories = cache(
  async (userId: string): Promise<SerializedCategory[]> => {
    try {
      const categories = await prisma.category.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })

      return categories.map(serializeCategory)
    } catch (error) {
      console.error('Error fetching categories:', error)
      return []
    }
  }
)

/**
 * Get a single category by ID
 * Business logic: Validate ownership
 */
export const getCategoryById = cache(
  async (categoryId: string, userId: string): Promise<SerializedCategory | null> => {
    try {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          userId, // Ensure user owns the category
        },
      })

      return category ? serializeCategory(category) : null
    } catch (error) {
      console.error('Error fetching category:', error)
      return null
    }
  }
)

/**
 * Create a new category
 * Business logic: Validate input, check for duplicates
 */
export async function createCategory(
  input: CreateCategoryInput
): Promise<CategoryActionResult<SerializedCategory>> {
  try {
    const { userId, ...rest } = input
    const outcome = await createCategoryForUser(userId, rest)
    if (outcome.ok) revalidateCategoryPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error creating category:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create category',
    }
  }
}

/**
 * Update an existing category
 * Business logic: Validate ownership, check for duplicates
 */
export async function updateCategory(
  categoryId: string,
  userId: string,
  input: UpdateCategoryInput
): Promise<CategoryActionResult<SerializedCategory>> {
  try {
    const outcome = await updateCategoryForUser(userId, categoryId, input)
    if (outcome.ok) revalidateCategoryPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error updating category:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update category',
    }
  }
}

/**
 * Delete a category
 * Business logic: Validate ownership, handle expenses using this category
 */
export async function deleteCategory(
  categoryId: string,
  userId: string
): Promise<CategoryActionResult<void>> {
  try {
    const outcome = await deleteCategoryForUser(userId, categoryId)
    if (outcome.ok) revalidateCategoryPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error deleting category:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete category',
    }
  }
}

/**
 * Get category count for a user
 * Business logic: Simple count query
 */
export const getCategoryCount = cache(async (userId: string): Promise<number> => {
  try {
    const count = await prisma.category.count({
      where: { userId },
    })

    return count
  } catch (error) {
    console.error('Error counting categories:', error)
    return 0
  }
})

/**
 * Set (or clear) a category's monthly soft limit (Phase 1)
 * Business logic: Validate ownership and that the limit is positive or null
 */
export async function setCategoryLimit(
  categoryId: string,
  limit: number | null
): Promise<CategoryActionResult<SerializedCategory>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await updateCategoryForUser(session.user.id, categoryId, {
      monthlyLimit: limit,
    })
    if (outcome.ok) {
      revalidatePath('/categories')
      revalidatePath('/expenses')
    }
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in setCategoryLimit:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set category limit',
    }
  }
}

/**
 * Categories with current-month spend status (Phase 1)
 * Seeds default categories for brand-new users, then attaches spent/ratio/level.
 */
export async function getCategoriesWithSpend(): Promise<
  CategoryActionResult<CategoryWithSpend[]>
> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    await ensureDefaultCategories(userId)

    const [categories, { statuses }] = await Promise.all([
      prisma.category.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      computeCategorySpendStatuses(userId),
    ])

    const statusById = new Map(statuses.map((s) => [s.categoryId, s]))

    const data: CategoryWithSpend[] = categories.map((category) => {
      const status = statusById.get(category.id)
      return {
        ...serializeCategory(category),
        spent: status?.spent ?? 0,
        ratio: status?.ratio ?? null,
        level: status?.level ?? 'ok',
      }
    })

    return { success: true, data }
  } catch (error) {
    console.error('Error in getCategoriesWithSpend:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load categories',
    }
  }
}
