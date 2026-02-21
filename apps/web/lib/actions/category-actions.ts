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
import { prisma } from '@extracker/db'
import type {
  ActionResult,
  SerializedCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@extracker/types'

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

      return categories
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

      return category
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
): Promise<ActionResult<SerializedCategory>> {
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
      data: category,
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
): Promise<ActionResult<SerializedCategory>> {
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
      data: category,
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
): Promise<ActionResult<void>> {
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
      data: undefined,
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
