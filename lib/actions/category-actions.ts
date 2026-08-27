'use server'

/**
 * Server Actions for Categories
 * BUSINESS LOGIC LAYER
 * - Handle CRUD operations for user categories
 * - Validate category names and colors
 * - Ensure users can only access their own categories
 */

import { revalidatePath } from 'next/cache'
import { cache } from 'react'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { ensureDefaultCategories } from '@/lib/services/default-categories'
import { computeCategorySpendStatuses } from '@/lib/services/spend-status-service'
import type { Category } from '@prisma/client'
import type {
  SerializedCategory,
  CategoryWithSpend,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryActionResult,
} from '@/types/category-types'

// Convert Prisma Decimal monthlyLimit to number for client components
function serializeCategory(category: Category): SerializedCategory {
  return {
    ...category,
    monthlyLimit:
      category.monthlyLimit === null ? null : Number(category.monthlyLimit),
  }
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
    // Business logic: Trim and validate category name
    const categoryName = input.categoryName.trim()

    if (!categoryName) {
      return {
        success: false,
        error: 'Category name is required',
      }
    }

    if (categoryName.length > 50) {
      return {
        success: false,
        error: 'Category name must be less than 50 characters',
      }
    }

    // Business logic: Check for duplicate category name
    const existingCategory = await prisma.category.findFirst({
      where: {
        userId: input.userId,
        categoryName: {
          equals: categoryName,
          mode: 'insensitive', // Case-insensitive check
        },
      },
    })

    if (existingCategory) {
      return {
        success: false,
        error: 'A category with this name already exists',
      }
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        userId: input.userId,
        categoryName,
        color: input.color || '#3b82f6', // Default blue
      },
    })

    // Revalidate pages
    revalidatePath('/categories')
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return {
      success: true,
      data: serializeCategory(category),
    }
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
    // Business logic: Verify ownership
    const existingCategory = await prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
      },
    })

    if (!existingCategory) {
      return {
        success: false,
        error: 'Category not found or you do not have permission to edit it',
      }
    }

    // Business logic: Validate category name if provided
    if (input.categoryName !== undefined) {
      const categoryName = input.categoryName.trim()

      if (!categoryName) {
        return {
          success: false,
          error: 'Category name cannot be empty',
        }
      }

      if (categoryName.length > 50) {
        return {
          success: false,
          error: 'Category name must be less than 50 characters',
        }
      }

      // Check for duplicate name (excluding current category)
      const duplicateCategory = await prisma.category.findFirst({
        where: {
          userId,
          categoryName: {
            equals: categoryName,
            mode: 'insensitive',
          },
          NOT: {
            id: categoryId,
          },
        },
      })

      if (duplicateCategory) {
        return {
          success: false,
          error: 'A category with this name already exists',
        }
      }
    }

    // Update category
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        categoryName: input.categoryName?.trim(),
        color: input.color,
      },
    })

    // Revalidate pages
    revalidatePath('/categories')
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return {
      success: true,
      data: serializeCategory(category),
    }
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
    // Business logic: Verify ownership
    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
      },
    })

    if (!category) {
      return {
        success: false,
        error: 'Category not found or you do not have permission to delete it',
      }
    }

    // Business logic: Check if any expenses use this category
    const expensesWithCategory = await prisma.expense.count({
      where: {
        userId,
        category: category.categoryName,
      },
    })

    if (expensesWithCategory > 0) {
      return {
        success: false,
        error: `Cannot delete category. ${expensesWithCategory} expense(s) are using this category. Please update or delete those expenses first.`,
      }
    }

    // Delete category
    await prisma.category.delete({
      where: { id: categoryId },
    })

    // Revalidate pages
    revalidatePath('/categories')
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return {
      success: true,
    }
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
    const userId = session.user.id

    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
      return { success: false, error: 'Limit must be greater than zero' }
    }

    // SECURITY: verify ownership
    const existing = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    })
    if (!existing) {
      return { success: false, error: 'Category not found or access denied' }
    }

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: { monthlyLimit: limit },
    })

    revalidatePath('/categories')
    revalidatePath('/expenses')

    return { success: true, data: serializeCategory(category) }
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
