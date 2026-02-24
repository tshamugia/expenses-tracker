import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { PaginatedResponse, PaymentCardListItem } from '@extracker/types'

/**
 * Fetch all payment cards for the authenticated user.
 * Requests up to 100 items to avoid pagination in pickers / forms.
 */
export function usePaymentCards() {
  return useQuery({
    queryKey: ['payment-cards'],
    queryFn: async () => {
      const { data, error } = await api['payment-cards'].get({
        query: { pageSize: 100 },
      })
      if (error) throw error
      // API wraps in { success: true, data: PaginatedResponse }
      const response = data as unknown as { success: boolean; data: PaginatedResponse<PaymentCardListItem> }
      return response.data
    },
  })
}

interface CreatePaymentCardBody {
  cardholderName: string
  cardNumber: string
  expiryMonth: number
  expiryYear: number
  nickname?: string
  color?: string
}

/** Create a new payment card. Invalidates the card list on success. */
export function useCreatePaymentCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: CreatePaymentCardBody) => {
      const { data, error } = await api['payment-cards'].post(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards'] })
    },
  })
}

interface UpdatePaymentCardBody {
  id: string
  cardholderName?: string
  expiryMonth?: number
  expiryYear?: number
  nickname?: string
  color?: string
}

/** Update an existing payment card. Invalidates the card list on success. */
export function useUpdatePaymentCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...body }: UpdatePaymentCardBody) => {
      const { data, error } = await api['payment-cards']({ id }).patch(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards'] })
    },
  })
}

/** Delete a payment card. Linked expenses get paymentCardId = null. */
export function useDeletePaymentCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api['payment-cards']({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}
