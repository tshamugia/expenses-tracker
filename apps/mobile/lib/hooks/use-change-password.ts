import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/**
 * Change password for the authenticated user.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: ChangePasswordInput) => {
      const { data, error } = await api.auth['change-password'].post(body)
      if (error) throw error
      return data
    },
  })
}
