import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExpenseListItem } from '@/types/expense-types'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import { formatExpenseDate } from '@/lib/utils/date-helpers'

interface ExpenseCardProps {
  expense: ExpenseListItem
}

function getStatusBadge(expense: ExpenseListItem) {
  if (expense.isPaid) {
    return <Badge variant="default" className="bg-green-600">Paid</Badge>
  }
  if (expense.isOverdue) {
    return <Badge variant="destructive">Overdue</Badge>
  }
  return <Badge variant="secondary">Pending</Badge>
}

export function ExpenseCard({ expense }: ExpenseCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{expense.title}</h3>
            {expense.isRecurring && (
              <Badge variant="outline" className="text-xs">
                Recurring
              </Badge>
            )}
          </div>
          {expense.category && (
            <p className="mt-1 text-sm text-muted-foreground">
              {expense.category}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            <p className="text-2xl font-bold">
              {formatCurrency(expense.amount, expense.currency)}
            </p>
            {getStatusBadge(expense)}
          </div>
          {expense.nextDueDate && (
            <p className="mt-2 text-sm text-muted-foreground">
              Due: {formatExpenseDate(expense.nextDueDate)}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Mark as Paid</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
