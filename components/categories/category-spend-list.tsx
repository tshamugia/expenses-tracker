'use client'

/**
 * Categories tab on /expenses (Phase 1 §6.3)
 * Per-category progress bar (spent/limit, color by level) with inline
 * editing of the monthly soft limit.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { setCategoryLimit } from '@/lib/actions/category-actions'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { CategoryWithSpend } from '@/types/category-types'
import { CategoryProgressBar } from './category-progress-bar'

interface CategorySpendListProps {
  categories: CategoryWithSpend[]
  defaultCurrency: string
}

export function CategorySpendList({ categories, defaultCurrency }: CategorySpendListProps) {
  const router = useRouter()
  const t = useTranslations('CategorySpendList')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [limitValue, setLimitValue] = useState('')
  const [isPending, startTransition] = useTransition()
  const symbol = getCurrencySymbol(defaultCurrency as Currency)

  const startEditing = (category: CategoryWithSpend) => {
    setEditingId(category.id)
    setLimitValue(category.monthlyLimit !== null ? String(category.monthlyLimit) : '')
  }

  const saveLimit = (categoryId: string) => {
    const trimmed = limitValue.trim()
    const limit = trimmed === '' ? null : Number(trimmed.replace(',', '.'))

    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
      toast.error(t('limitInvalid'))
      return
    }

    startTransition(async () => {
      const result = await setCategoryLimit(categoryId, limit)
      if (result.success) {
        toast.success(limit === null ? t('limitRemoved') : t('limitSaved'))
        setEditingId(null)
        router.refresh()
      } else {
        toast.error(t('limitSaveFailed'), { description: result.error })
      }
    })
  }

  return (
    <div className="space-y-3">
      {categories.map((category) => (
        <Card key={category.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="truncate font-medium">{category.categoryName}</span>
                {category.kind === 'FIXED' && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {t('fixedBadge')}
                  </span>
                )}
              </div>

              {editingId === category.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    inputMode="decimal"
                    value={limitValue}
                    onChange={(e) => setLimitValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveLimit(category.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    placeholder={t('limitPlaceholder')}
                    className="h-8 w-24"
                    aria-label={t('limitAria', { category: category.categoryName })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={isPending}
                    onClick={() => saveLimit(category.id)}
                    aria-label={t('saveAria')}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                    aria-label={t('cancelAria')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditing(category)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  {category.monthlyLimit !== null ? (
                    <span>
                      {category.spent.toFixed(0)}/{category.monthlyLimit.toFixed(0)}
                      {symbol}
                      {category.ratio !== null && (
                        <span className="ml-1">({Math.round(category.ratio * 100)}%)</span>
                      )}
                    </span>
                  ) : (
                    <span>
                      {category.spent.toFixed(0)}
                      {symbol} · {t('noLimit')}
                    </span>
                  )}
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <CategoryProgressBar
              spent={category.spent}
              limit={category.monthlyLimit}
              level={category.level}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
