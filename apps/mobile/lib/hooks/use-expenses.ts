import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { EXPENSES_PER_PAGE } from '@extracker/core'
import type { PaginatedResponse, ExpenseListItem } from '@extracker/types'

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

interface UseExpensesFilters {
  category?: string | null
}

/**
 * Infinite-scroll query for the paginated expense list.
 * Supports optional category filter.
 */
export function useExpenses(filters?: UseExpensesFilters) {
  return useInfiniteQuery({
    queryKey: ['expenses', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const query: Record<string, string | number> = {
        page: pageParam,
        pageSize: EXPENSES_PER_PAGE,
      }
      if (filters?.category) {
        query.category = filters.category
      }

      const { data, error } = await api.expenses.get({ query })
      if (error) throw error
      // API wraps in { success: true, data: PaginatedResponse }
      const response = data as unknown as { success: boolean; data: PaginatedResponse<ExpenseListItem> }
      return response.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) return lastPage.page + 1
      return undefined
    },
  })
}

/**
 * Fetch a single expense by ID, including its payments and relations.
 */
export function useExpense(id: string) {
  return useQuery({
    queryKey: ['expense', id],
    queryFn: async () => {
      const { data, error } = await api.expenses({ id }).get()
      if (error) throw error
      // API wraps in { success: true, data: expense }
      const response = data as unknown as { success: boolean; data: Record<string, unknown> }
      return response.data
    },
    enabled: !!id,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

interface CreateExpenseBody {
  title: string
  amount: number
  currency?: 'GEL' | 'USD' | 'EUR'
  description?: string
  category?: string
  isRecurring?: boolean
  recurrenceRule?: string
  startDate?: string
  nextDueDate?: string
  paymentCardId?: string
}

/** Create a new expense. Invalidates the expense list and dashboard on success. */
export function useCreateExpense() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: CreateExpenseBody) => {
      const { data, error } = await api.expenses.post(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

interface UpdateExpenseBody {
  id: string
  title?: string
  amount?: number
  currency?: 'GEL' | 'USD' | 'EUR'
  description?: string
  category?: string
  isRecurring?: boolean
  recurrenceRule?: string
  startDate?: string
  nextDueDate?: string
  paymentCardId?: string | null
}

/** Update an existing expense. Invalidates related caches on success. */
export function useUpdateExpense() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateExpenseBody) => {
      const { data, error } = await api.expenses({ id }).patch(body)
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expense', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** Delete an expense by ID. Invalidates the expense list and dashboard. */
export function useDeleteExpense() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.expenses({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** Mark the current payment on an expense as paid. */
export function useMarkExpensePaid() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.expenses({ id })['mark-paid'].post()
      if (error) throw error
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expense', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
