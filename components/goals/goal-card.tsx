'use client'

/**
 * A single user goal in the /goals list (Phase 3 §6.1).
 * Progress bar, saved/target, and a status badge: on_track / behind (with the
 * concrete "+X/mo or move date → …" advice) / achieved / no_plan. Carries a
 * quick contribute "+" and optional priority ↑↓ controls. The title links to
 * the goal detail; the rest of the card is non-navigational so the inline
 * buttons don't nest inside a link.
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { GoalListItem } from '@/types/goal-types'

interface GoalCardProps {
  item: GoalListItem
  onContribute: () => void
  onWithdraw: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  isFirst?: boolean
  isLast?: boolean
}

export function GoalCard({
  item,
  onContribute,
  onWithdraw,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: GoalCardProps) {
  const t = useTranslations('Goals')
  const { goal, progress } = item
  const symbol = getCurrencySymbol(goal.currency as Currency)
  const percent = Math.round(progress.percent)

  const badge =
    progress.status === 'achieved' ? (
      <Badge className="bg-emerald-500 hover:bg-emerald-500">
        {t('statusAchieved')}
      </Badge>
    ) : progress.status === 'behind' ? (
      <Badge variant="destructive">{t('statusBehind')}</Badge>
    ) : progress.status === 'on_track' ? (
      <Badge className="bg-emerald-600/90 hover:bg-emerald-600">
        {t('statusOnTrack')}
      </Badge>
    ) : (
      <Badge variant="secondary">{t('statusNoPlan')}</Badge>
    )

  return (
    <Card className="h-full">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/goals/${goal.id}`}
            className="font-semibold hover:underline"
          >
            {goal.name}
          </Link>
          <div className="flex items-center gap-1">
            {badge}
            {(onMoveUp || onMoveDown) && (
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={isFirst}
                  aria-label={t('priorityUp')}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={isLast}
                  aria-label={t('priorityDown')}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {progress.saved.toFixed(0)}
            {symbol} / {progress.targetAmount.toFixed(0)}
            {symbol}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('progressLabel', { percent })}
          </span>
        </div>

        {progress.status === 'behind' && progress.behindAdvice && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {t('behindAdvice', {
              amount: `${progress.behindAdvice.increaseMonthlyBy.toFixed(0)}${symbol}`,
              date: format(new Date(progress.behindAdvice.orMoveDateTo), 'MMM yyyy'),
            })}
          </p>
        )}

        {progress.status !== 'behind' && progress.projectedDate && (
          <p className="text-xs text-muted-foreground">
            {t('projected')}:{' '}
            {format(new Date(progress.projectedDate), 'MMM yyyy')}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="gap-1" onClick={onContribute}>
            <Plus className="h-3.5 w-3.5" />
            {t('contribute')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={onWithdraw}
            disabled={progress.saved <= 0}
          >
            <Minus className="h-3.5 w-3.5" />
            {t('withdraw')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
