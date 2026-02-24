import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { UserSettings, UpdateSettingsInput } from '@extracker/types'

/**
 * Fetch user settings (notification preferences, theme, currency, subscription).
 */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await api.settings.get()
      if (error) throw error
      const response = data as unknown as { success: boolean; data: UserSettings }
      return response.data
    },
  })
}

/**
 * Update user settings. Optimistically updates the cache and reverts on error.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: UpdateSettingsInput) => {
      const { data, error } = await api.settings.patch(body)
      if (error) throw error
      const response = data as unknown as { success: boolean; data: UserSettings }
      return response.data
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<UserSettings>(['settings'])
      if (previous) {
        queryClient.setQueryData<UserSettings>(['settings'], {
          ...previous,
          ...newSettings,
        })
      }
      return { previous }
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
