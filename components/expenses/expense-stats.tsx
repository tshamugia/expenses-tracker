import { 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertCircle 
} from 'lucide-react'
import { StatCard } from './stat-card'
import type { DashboardStats } from '@/types/expense-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'

interface ExpenseStatsProps {
  data: DashboardStats
  currency?: string
}

export function ExpenseStats({ data, currency = 'USD' }: ExpenseStatsProps) {
  const { total, paid, pending, overdue } = data

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Expenses"
        value={formatCurrency(total, currency)}
        icon={DollarSign}
        description="All time"
        colorClass="text-primary"
      />
      <StatCard
        title="Paid"
        value={formatCurrency(paid, currency)}
        icon={CheckCircle}
        description="Completed payments"
        colorClass="text-green-600"
      />
      <StatCard
        title="Pending"
        value={formatCurrency(pending, currency)}
        icon={Clock}
        description="Awaiting payment"
        colorClass="text-yellow-600"
      />
      <StatCard
        title="Overdue"
        value={formatCurrency(overdue, currency)}
        icon={AlertCircle}
        description="Past due date"
        colorClass="text-red-600"
      />
    </div>
  )
}
