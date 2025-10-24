import { getDashboardData } from '@/lib/actions/expense-actions'
import { DashboardClient } from './dashboard-client'
import { getAuthUserId } from '@/lib/auth/get-session'

export default async function DashboardPage() {
  // Get authenticated user ID
  const userId = await getAuthUserId()

  // Call Server Action (Business Logic Layer)
  const dashboardData = await getDashboardData(userId)

  return <DashboardClient dashboardData={dashboardData} userId={userId} />
}
