'use client'

/**
 * Variable expenses tab on /expenses (Phase 1 §6.3)
 * Ledger list with category filter, pagination ("load more"), and delete.
 * The list lives in the transaction store so global quick-add updates it
 * optimistically from anywhere in the app.
 */

import { useEffect, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  deleteTransaction,
  getTransactions,
} from '@/lib/actions/transaction-actions'
import { useTransactionStore } from '@/lib/stores/transaction-store'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { TransactionListItem } from '@/types/transaction-types'

interface TransactionListProps {
  initialTransactions: TransactionListItem[]
  totalCount: number
  categories: { id: string; categoryName: string }[]
  pageSize?: number
}

export function TransactionList({
  initialTransactions,
  totalCount,
  categories,
  pageSize = 20,
}: TransactionListProps) {
  const { transactions, setTransactions, appendTransactions, optimisticRemove, optimisticAdd } =
    useTransactionStore()
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  // null = show the server-provided count; set after client-side fetches
  const [fetchedTotal, setFetchedTotal] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const total = fetchedTotal ?? totalCount

  // Initialize the store with server data (re-runs after router.refresh)
  useEffect(() => {
    setTransactions(initialTransactions)
  }, [initialTransactions, setTransactions])

  const applyFilter = (value: string) => {
    setCategoryFilter(value)
    setPage(1)
    startTransition(async () => {
      const result = await getTransactions({
        type: 'EXPENSE',
        categoryId: value === 'all' ? undefined : value,
        page: 1,
        pageSize,
      })
      if (result.success && result.data) {
        setTransactions(result.data.items)
        setFetchedTotal(result.data.totalCount)
      }
    })
  }

  const loadMore = () => {
    const nextPage = page + 1
    startTransition(async () => {
      const result = await getTransactions({
        type: 'EXPENSE',
        categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
        page: nextPage,
        pageSize,
      })
      if (result.success && result.data) {
        appendTransactions(result.data.items)
        setPage(nextPage)
        setFetchedTotal(result.data.totalCount)
      }
    })
  }

  const handleDelete = (transaction: TransactionListItem) => {
    optimisticRemove(transaction.id)
    startTransition(async () => {
      const result = await deleteTransaction(transaction.id)
      if (result.success) {
        toast.success('ჩანაწერი წაიშალა')
        setFetchedTotal((t) => (t ?? totalCount) - 1)
      } else {
        optimisticAdd(transaction)
        toast.error('წაშლა ვერ მოხერხდა', { description: result.error })
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Select value={categoryFilter} onValueChange={applyFilter}>
          <SelectTrigger className="w-48" aria-label="კატეგორიის ფილტრი">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ყველა კატეგორია</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.categoryName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} ჩანაწერი</span>
      </div>

      {transactions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            ცვლადი ხარჯები ჯერ არ არის — დაამატე „+&quot; ღილაკით
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((transaction) => (
            <Card key={transaction.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: transaction.categoryColor ?? '#6b7280' }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {transaction.categoryName ?? 'უკატეგორიო'}
                      {transaction.description && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {transaction.description}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(transaction.date), 'dd MMM yyyy')}
                      {transaction.expenseId && ' · ფიქსირებულიდან'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold">
                    {transaction.amount.toFixed(2)}
                    {getCurrencySymbol(transaction.currency as Currency)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(transaction)}
                    aria-label="წაშლა"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {transactions.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={isPending}>
            {isPending ? 'იტვირთება…' : 'მეტის ჩვენება'}
          </Button>
        </div>
      )}
    </div>
  )
}
