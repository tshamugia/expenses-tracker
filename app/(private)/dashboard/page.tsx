import { getDashboardData } from '@/lib/actions/expense-actions'
import { DashboardClient } from './dashboard-client'
import { DEMO_USER_ID } from '@/lib/constants/app-config'

export default async function DashboardPage() {
  // Call Server Action (Business Logic Layer)
  const dashboardData = await getDashboardData(DEMO_USER_ID)

  return <DashboardClient dashboardData={dashboardData} userId={DEMO_USER_ID} />
}
