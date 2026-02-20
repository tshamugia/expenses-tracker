'use client'

import { PaymentsPage } from '@/components/payments/payments-page'
import type { PaymentCardListItem } from '@extracker/types'

interface PaymentsClientProps {
  cards: PaymentCardListItem[]
  userId: string
}

export function PaymentsClient({ cards, userId }: PaymentsClientProps) {
  return <PaymentsPage cards={cards} userId={userId} />
}
