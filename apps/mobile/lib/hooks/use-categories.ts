import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { PaginatedResponse, CategoryListItem } from '@extracker/types'

/**
 * Fetch all categories for the authenticated user.
 * Requests up to 100 items to avoid pagination in pickers / filters.
 */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await api.categories.get({
        query: { pageSize: 100 },
      })
      if (error) throw error
      // API wraps in { success: true, data: PaginatedResponse }
      const response = data as unknown as { success: boolean; data: PaginatedResponse<CategoryListItem> }
      return response.data
    },
  })
}

interface CreateCategoryBody {
  categoryName: string
  color?: string
}

/** Create a new category. Invalidates the category list on success. */
export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: CreateCategoryBody) => {
      const { data, error } = await api.categories.post(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

interface UpdateCategoryBody {
  id: string
  categoryName?: string
  color?: string
}

/** Update an existing category. Invalidates the category list on success. */
export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateCategoryBody) => {
      const { data, error } = await api.categories({ id }).patch(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

/** Delete a category by ID. Returns 409 if expenses reference this category. */
export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.categories({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
