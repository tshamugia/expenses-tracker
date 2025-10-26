'use client'

/**
 * ExpenseCharts Component
 * Displays interactive bar and pie charts for expense analytics
 * Uses Recharts library for visualization
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { CategoryData, DashboardStats } from '@/types/expense-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'

interface ExpenseChartsProps {
  categoryData: CategoryData[]
  stats: DashboardStats
  currency?: string
}

// Color palette for charts
const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
]

// Custom tooltip for currency formatting
const CustomTooltip = ({ active, payload, currency = 'GEL' }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-md">
        <p className="text-sm font-medium">{payload[0].name}</p>
        <p className="text-sm text-muted-foreground">
          Amount: {formatCurrency(payload[0].value, currency)}
        </p>
        {payload[0].payload.count && (
          <p className="text-sm text-muted-foreground">
            Count: {payload[0].payload.count}
          </p>
        )}
      </div>
    )
  }
  return null
}

export function ExpenseCharts({
  categoryData,
  stats,
  currency = 'GEL',
}: ExpenseChartsProps) {
  // Prepare data for status breakdown pie chart
  const statusData = [
    { name: 'Paid', value: stats.paid, color: '#10b981' },
    { name: 'Pending', value: stats.pending, color: '#f59e0b' },
    { name: 'Overdue', value: stats.overdue, color: '#ef4444' },
  ].filter((item) => item.value > 0) // Only show non-zero values

  // Prepare data for category bar chart (top 6 categories)
  const topCategories = categoryData.slice(0, 6).map((item) => ({
    name: item.category,
    amount: item.amount,
    count: item.count,
  }))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Category Breakdown - Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {topCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCategories}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `₾${value}`}
                />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="amount"
                  fill="hsl(var(--primary))"
                  radius={[8, 8, 0, 0]}
                  name="Amount"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No category data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Status - Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) =>
                    `${entry.name} ${(entry.percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip currency={currency} />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No expense data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
