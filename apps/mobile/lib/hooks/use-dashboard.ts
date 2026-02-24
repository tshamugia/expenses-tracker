import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { DashboardData } from '@extracker/types'

/**
 * Fetch aggregated dashboard data: stats, recent expenses, upcoming
 * expenses, and category breakdown.
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await api.dashboard.get()
      if (error) throw error
      // API wraps in { success: true, data: DashboardData }
      const response = data as unknown as { success: boolean; data: DashboardData }
      return response.data
    },
  })
}
