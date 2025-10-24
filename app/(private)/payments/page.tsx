import { getUserPaymentCardsWithStats } from '@/lib/actions/payment-card-actions'
import { PaymentsClient } from './payments-client'
import { DEMO_USER_ID } from '@/lib/constants/app-config'

export default async function PaymentsPage() {
  // Call Server Action (Business Logic Layer)
  const cards = await getUserPaymentCardsWithStats(DEMO_USER_ID)

  return <PaymentsClient cards={cards} userId={DEMO_USER_ID} />
}
