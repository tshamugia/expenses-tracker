/**
 * Categories Page
 * Server Component that fetches categories for authenticated user
 */

import { getUserCategories } from '@/lib/actions/category-actions'
import { getAuthUserId } from '@/lib/auth/get-session'
import { CategoriesClient } from './categories-client'

export default async function CategoriesPage() {
  // Get authenticated user ID
  const userId = await getAuthUserId()

  // Fetch categories from the server
  const categories = await getUserCategories(userId)

  return <CategoriesClient initialCategories={categories} userId={userId} />
}
