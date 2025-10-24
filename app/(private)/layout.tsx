import { AppLayout } from '@/components/layout/app-layout'

export const metadata = {
  title: 'Expense Tracker - Dashboard',
  description: 'Track your expenses and manage payments',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppLayout>{children}</AppLayout>
}
