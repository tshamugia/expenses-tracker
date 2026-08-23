import type { Category } from '@prisma/client'

/**
 * Category Types
 * Type definitions for category management
 */

// Basic category type from Prisma
export type { Category }

// Serialized category for client components (Decimal → number)
export type SerializedCategory = Omit<Category, 'monthlyLimit'> & {
  monthlyLimit: number | null
}

// Category enriched with current-month spend status (Phase 1)
export interface CategoryWithSpend extends SerializedCategory {
  spent: number
  ratio: number | null
  level: 'ok' | 'warning' | 'over'
}

// View model for category list
export interface CategoryListItem {
  id: string
  categoryName: string
  color: string
  createdAt: Date
}

// Input for creating a category
export interface CreateCategoryInput {
  userId: string
  categoryName: string
  color?: string
}

// Input for updating a category
export interface UpdateCategoryInput {
  categoryName?: string
  color?: string
}

// Action result wrapper
export interface CategoryActionResult<T> {
  success: boolean
  data?: T
  error?: string
}
