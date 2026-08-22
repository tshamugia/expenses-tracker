import { Card } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  icon: LucideIcon
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  colorClass?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  colorClass = 'text-primary',
}: StatCardProps) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>
        <Icon className={cn('h-4 w-4 shrink-0 sm:h-5 sm:w-5', colorClass)} />
      </div>
      <div className="mt-2 sm:mt-3">
        <p className="truncate text-xl font-bold sm:text-2xl">{value}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <p
            className={cn(
              'mt-1 text-xs',
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            )}
          >
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </p>
        )}
      </div>
    </Card>
  )
}
