'use client'

/**
 * A single PROPOSED (wishlist) goal in the /goals list.
 * Shows the goal's own analytics — price (target), monthly payment and payoff
 * time — plus a what-if line previewing how approving it would lower this
 * month's Safe-to-Spend. Primary action is Approve (promotes it to ACTIVE so it
 * enters the plan); Delete removes it from the wishlist. The title links to the
 * detail page, where the goal can be edited.
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Check, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { GoalListItem } from '@/types/goal-types'

interface GoalProposedCardProps {
  item: GoalListItem
  onApprove: () => void
  onDelete: () => void
  isBusy?: boolean
}

export function GoalProposedCard({
  item,
  onApprove,
  onDelete,
  isBusy,
}: GoalProposedCardProps) {
  const t = useTranslations('Goals')
  const { goal, progress, whatIf } = item
  const symbol = getCurrencySymbol(goal.currency as Currency)

  const monthly =
    goal.monthlyContribution ?? progress.requiredMonthly ?? null
  const payoff = progress.projectedDate
    ? format(new Date(progress.projectedDate), 'MMM yyyy')
    : progress.monthsLeft != null
      ? t('payoffMonths', { months: progress.monthsLeft })
      : null

  return (
    <Card className="h-full border-dashed">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/goals/${goal.id}`}
            className="font-semibold hover:underline"
          >
            {goal.name}
          </Link>
          <Badge variant="secondary">{t('statusProposed')}</Badge>
        </div>

        {/* Analytics: price / monthly payment / payoff time */}
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t('priceLabel')}</dt>
            <dd className="font-medium">
              {goal.targetAmount.toFixed(0)}
              {symbol}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('monthlyLabel')}</dt>
            <dd className="font-medium">
              {monthly != null ? `${monthly.toFixed(0)}${symbol}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('payoffLabel')}</dt>
            <dd className="font-medium">{payoff ?? '—'}</dd>
          </div>
        </dl>

        {/* What-if impact on Safe-to-Spend if approved */}
        {whatIf && (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            {whatIf.deltaMonthly > 0
              ? t('whatIfImpact', {
                  amount: `${whatIf.deltaMonthly.toFixed(0)}${symbol}`,
                })
              : t('whatIfNoImpact')}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1"
            onClick={onApprove}
            disabled={isBusy}
          >
            <Check className="h-3.5 w-3.5" />
            {t('approve')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isBusy}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
