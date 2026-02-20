import { getUserPaymentCardsWithStats } from '@/lib/actions/payment-card-actions'
import { PaymentsClient } from './payments-client'
import { getAuthUserId } from '@/lib/auth/get-session'

export default async function PaymentsPage() {
  // Get authenticated user ID
  const userId = await getAuthUserId()

  // Call Server Action (Business Logic Layer)
  const cards = await getUserPaymentCardsWithStats(userId)

  return <PaymentsClient cards={cards} userId={userId} />
}
