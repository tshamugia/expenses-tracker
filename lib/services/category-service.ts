/**
 * Categories — userId-first business logic (no session, no revalidation).
 * Shared by the category Server Actions and the MCP tools.
 * A category has a name, a colour, a kind (FIXED / VARIABLE — decides whether
 * it is a mandatory line or a variable target in the monthly plan) and an
 * optional monthly soft limit.
 */

import prisma from '@/lib/db/prisma'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import type { Category } from '@prisma/client'
import type {
  CategoryKind,
  CreateCategoryInput,
  SerializedCategory,
  UpdateCategoryInput,
} from '@/types/category-types'

export const CATEGORY_KINDS: readonly CategoryKind[] = ['FIXED', 'VARIABLE']
export const MAX_CATEGORY_NAME_LENGTH = 50
export const DEFAULT_CATEGORY_COLOR = '#3b82f6'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Convert Prisma Decimal monthlyLimit to number for client components. */
export function serializeCategory(category: Category): SerializedCategory {
  return {
    ...category,
    monthlyLimit: category.monthlyLimit === null ? null : Number(category.monthlyLimit),
  }
}

function validateName(raw: string): { name: string } | { error: string } {
  const name = raw.trim()
  if (!name) return { error: 'Category name is required' }
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { error: `Category name must be less than ${MAX_CATEGORY_NAME_LENGTH} characters` }
  }
  return { name }
}

function validateOptionalFields(input: {
  color?: string
  kind?: CategoryKind
  monthlyLimit?: number | null
}): string | null {
  if (input.color !== undefined && !HEX_COLOR.test(input.color)) {
    return 'Color must be a hex value like #3b82f6'
  }
  if (input.kind !== undefined && !CATEGORY_KINDS.includes(input.kind)) {
    return 'Kind must be FIXED or VARIABLE'
  }
  if (
    input.monthlyLimit !== undefined &&
    input.monthlyLimit !== null &&
    (!Number.isFinite(input.monthlyLimit) || input.monthlyLimit <= 0)
  ) {
    return 'Limit must be greater than zero'
  }
  return null
}

/** Create a category (name unique per user, case-insensitive). */
export async function createCategoryForUser(
  userId: string,
  input: Omit<CreateCategoryInput, 'userId'>
): Promise<Outcome<SerializedCategory>> {
  const named = validateName(input.categoryName)
  if ('error' in named) return fail(named.error)
  const fieldError = validateOptionalFields(input)
  if (fieldError) return fail(fieldError)

  const existing = await prisma.category.findFirst({
    where: { userId, categoryName: { equals: named.name, mode: 'insensitive' } },
  })
  if (existing) return fail('A category with this name already exists')

  const category = await prisma.category.create({
    data: {
      userId,
      categoryName: named.name,
      color: input.color || DEFAULT_CATEGORY_COLOR,
      kind: input.kind ?? 'VARIABLE',
      monthlyLimit: input.monthlyLimit ?? null,
    },
  })

  return ok(serializeCategory(category))
}

/** Update a category's name, colour, kind and/or monthly limit (null clears it). */
export async function updateCategoryForUser(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput
): Promise<Outcome<SerializedCategory>> {
  // SECURITY: verify ownership
  const existing = await prisma.category.findFirst({ where: { id: categoryId, userId } })
  if (!existing) return fail('Category not found or you do not have permission to edit it')

  let categoryName: string | undefined
  if (input.categoryName !== undefined) {
    const named = validateName(input.categoryName)
    if ('error' in named) return fail(named.error)
    categoryName = named.name

    // Check for duplicate name (excluding current category)
    const duplicate = await prisma.category.findFirst({
      where: {
        userId,
        categoryName: { equals: categoryName, mode: 'insensitive' },
        NOT: { id: categoryId },
      },
    })
    if (duplicate) return fail('A category with this name already exists')
  }

  const fieldError = validateOptionalFields(input)
  if (fieldError) return fail(fieldError)

  const category = await prisma.category.update({
    where: { id: categoryId },
    data: {
      categoryName,
      color: input.color,
      kind: input.kind,
      monthlyLimit: input.monthlyLimit,
    },
  })

  return ok(serializeCategory(category))
}

/**
 * Delete a category. Refused while fixed bills (Expense) still use its name;
 * ledger transactions keep their history (categoryId is set to null).
 */
export async function deleteCategoryForUser(
  userId: string,
  categoryId: string
): Promise<Outcome<void>> {
  // SECURITY: verify ownership
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } })
  if (!category) return fail('Category not found or you do not have permission to delete it')

  const expensesWithCategory = await prisma.expense.count({
    where: { userId, category: category.categoryName },
  })
  if (expensesWithCategory > 0) {
    return fail(
      `Cannot delete category. ${expensesWithCategory} expense(s) are using this category. Please update or delete those expenses first.`
    )
  }

  await prisma.category.delete({ where: { id: categoryId } })

  return ok(undefined)
}
