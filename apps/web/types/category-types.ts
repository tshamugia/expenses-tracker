import type { Category } from '@prisma/client'

/**
 * Category Types
 * Type definitions for category management
 */

// Basic category type from Prisma
export type { Category }

// Serialized category for client components
export type SerializedCategory = Category

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
