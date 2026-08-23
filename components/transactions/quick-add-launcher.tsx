'use client'

/**
 * Global quick-add launcher (Phase 1 §6.2)
 * - variant "header": "+" button in the app header (desktop + mobile)
 * - variant "fab": floating action button (mobile only)
 * Lazily loads categories on first open, submits via the quickAddExpense
 * server action with an optimistic entry in the transaction store, and shows
 * the category soft-limit status in the toast.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getCategoriesWithSpend } from '@/lib/actions/category-actions'
import { quickAddExpense } from '@/lib/actions/transaction-actions'
import { useTransactionStore } from '@/lib/stores/transaction-store'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import {
  QuickAddExpenseDialog,
  type QuickAddCategory,
  type QuickAddFormData,
} from './quick-add-expense-dialog'

const LAST_CATEGORY_KEY = 'extracker:quick-add:last-category'

interface QuickAddLauncherProps {
  variant: 'header' | 'fab'
}

export function QuickAddLauncher({ variant }: QuickAddLauncherProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<QuickAddCategory[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { optimisticAdd, optimisticRemove, optimisticReplace } =
    useTransactionStore()

  const handleOpen = useCallback(async () => {
    setOpen(true)
    const result = await getCategoriesWithSpend()
    if (result.success && result.data) {
      // Most recently used category first (Phase 1: chips ordered by last use)
      const lastUsedId =
        typeof window !== 'undefined'
          ? localStorage.getItem(LAST_CATEGORY_KEY)
          : null
      const sorted = [...result.data].sort((a, b) => {
        if (a.id === lastUsedId) return -1
        if (b.id === lastUsedId) return 1
        return 0
      })
      setCategories(sorted)
    }
  }, [])

  const handleSubmit = async (data: QuickAddFormData) => {
    const category = categories.find((c) => c.id === data.categoryId)
    const tempId = `temp-${Date.now()}`

    // Optimistic entry so the variable-expenses list updates instantly
    optimisticAdd({
      id: tempId,
      type: 'EXPENSE',
      amount: data.amount,
      currency: data.currency,
      date: new Date(),
      categoryId: data.categoryId,
      categoryName: category?.categoryName ?? null,
      categoryColor: category?.color ?? null,
      incomeSourceId: null,
      incomeSourceName: null,
      expenseId: null,
      description: data.description ?? null,
      entrySource: 'MANUAL',
    })

    setIsSubmitting(true)
    const result = await quickAddExpense(data)
    setIsSubmitting(false)

    if (result.success && result.data) {
      localStorage.setItem(LAST_CATEGORY_KEY, data.categoryId)
      optimisticReplace(tempId, {
        ...result.data.transaction,
        categoryName: category?.categoryName ?? null,
        categoryColor: category?.color ?? null,
        incomeSourceName: null,
      })
      setOpen(false)

      const status = result.data.categoryStatus
      const symbol = getCurrencySymbol(result.data.defaultCurrency as Currency)
      if (status && status.limit !== null && status.ratio !== null && status.level !== 'ok') {
        const message = `${status.categoryName}: ${status.spent.toFixed(0)}/${status.limit.toFixed(0)}${symbol} — ორიენტირის ${Math.round(status.ratio * 100)}%`
        if (status.level === 'over') {
          toast.error('ხარჯი დამატებულია', { description: message })
        } else {
          toast.warning('ხარჯი დამატებულია', { description: message })
        }
      } else {
        toast.success('ხარჯი დამატებულია')
      }

      router.refresh()
    } else {
      optimisticRemove(tempId)
      toast.error('ხარჯის დამატება ვერ მოხერხდა', {
        description: result.error,
      })
    }
  }

  return (
    <>
      {variant === 'header' ? (
        <Button
          variant="default"
          size="sm"
          onClick={handleOpen}
          className="gap-1"
          aria-label="ხარჯის სწრაფი დამატება"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">ხარჯი</span>
        </Button>
      ) : (
        <Button
          size="icon"
          onClick={handleOpen}
          aria-label="ხარჯის სწრაფი დამატება"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg md:hidden"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      <QuickAddExpenseDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </>
  )
}
