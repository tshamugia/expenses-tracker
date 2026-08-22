import {
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  Hash
} from 'lucide-react'
import { StatCard } from './stat-card'
import type { DashboardStats } from '@/types/expense-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'

interface ExpenseStatsProps {
  data: DashboardStats
  currency?: string
}

export function ExpenseStats({ data, currency = 'GEL' }: ExpenseStatsProps) {
  const { total, paid, pending, overdue, count } = data

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-5">
      {/* Total Count Card - New */}
      <StatCard
        title="Total Count"
        value={count.toString()}
        icon={Hash}
        description="Number of expenses"
        colorClass="text-primary"
      />

      {/* Total Amount Card */}
      <StatCard
        title="Total Amount"
        value={formatCurrency(total, currency)}
        icon={DollarSign}
        description="All time"
        colorClass="text-blue-600"
      />

      {/* Paid Card */}
      <StatCard
        title="Paid"
        value={formatCurrency(paid, currency)}
        icon={CheckCircle}
        description="Completed payments"
        colorClass="text-green-600"
      />

      {/* Pending Card */}
      <StatCard
        title="Pending"
        value={formatCurrency(pending, currency)}
        icon={Clock}
        description="Awaiting payment"
        colorClass="text-yellow-600"
      />

      {/* Overdue Card */}
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
