'use client'

/**
 * Goal detail (Phase 3 §6.2).
 * Header + progress summary, the cumulative-progress chart, the movement
 * history (contributions / withdrawals with reason), and contribute / withdraw
 * / edit / archive actions. The emergency fund hides edit/archive (managed
 * automatically). Mutations go through server actions; re-fetch on success.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { ArrowLeft, Archive, Minus, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  archiveGoal,
  contributeToGoal,
  updateGoal,
  withdrawFromGoal,
} from '@/lib/actions/goal-actions'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { GoalDetail } from '@/types/goal-types'
import {
  GoalContributeDialog,
  type GoalMovementData,
  type GoalMovementMode,
} from './goal-contribute-dialog'
import { GoalDialog, type GoalFormData } from './goal-dialog'
import { GoalProgressChart } from './goal-progress-chart'

interface GoalDetailClientProps {
  detail: GoalDetail
}

export function GoalDetailClient({ detail }: GoalDetailClientProps) {
  const t = useTranslations('GoalDetail')
  const tg = useTranslations('Goals')
  const tm = useTranslations('GoalContributeDialog')
  const router = useRouter()
  const { goal, contributions, progress } = detail
  const symbol = getCurrencySymbol(goal.currency as Currency)

  const [movementMode, setMovementMode] = useState<GoalMovementMode | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isReserve = goal.isEmergencyFund

  const statusLabel =
    progress.status === 'achieved'
      ? tg('statusAchieved')
      : progress.status === 'behind'
        ? tg('statusBehind')
        : progress.status === 'on_track'
          ? tg('statusOnTrack')
          : tg('statusNoPlan')

  const handleMovement = (data: GoalMovementData) => {
    if (!movementMode) return
    startTransition(async () => {
      const result =
        movementMode === 'contribute'
          ? await contributeToGoal(goal.id, { amount: data.amount, date: data.date })
          : await withdrawFromGoal(goal.id, {
              amount: data.amount,
              date: data.date,
              reason: data.reason ?? '',
            })
      if (result.success) {
        toast.success(
          movementMode === 'contribute' ? tm('contributed') : tm('withdrawn')
        )
        setMovementMode(null)
        router.refresh()
      } else {
        toast.error(tm('failed'), { description: result.error })
      }
    })
  }

  const handleEdit = (data: GoalFormData) => {
    startTransition(async () => {
      const result = await updateGoal(goal.id, {
        name: data.name,
        targetAmount: data.targetAmount,
        targetDate: data.targetDate,
        monthlyContribution: data.monthlyContribution,
      })
      if (result.success) {
        toast.success(tg('goalAdded'))
        setEditOpen(false)
        router.refresh()
      } else {
        toast.error(tg('saveFailed'), { description: result.error })
      }
    })
  }

  const handleArchive = () => {
    startTransition(async () => {
      const result = await archiveGoal(goal.id)
      if (result.success) {
        router.push('/goals')
      } else {
        toast.error(tg('saveFailed'), { description: result.error })
      }
    })
  }

  const percent = Math.round(progress.percent)

  return (
    <div className="space-y-6">
      <Link
        href="/goals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{goal.name}</h1>
            <Badge variant={progress.status === 'behind' ? 'destructive' : 'secondary'}>
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tg('progressLabel', { percent })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setMovementMode('contribute')} className="gap-1">
            <Plus className="h-4 w-4" />
            {tg('contribute')}
          </Button>
          <Button
            onClick={() => setMovementMode('withdraw')}
            variant="outline"
            className="gap-1"
            disabled={progress.saved <= 0}
          >
            <Minus className="h-4 w-4" />
            {tg('withdraw')}
          </Button>
          {!isReserve && (
            <>
              <Button
                onClick={() => setEditOpen(true)}
                variant="ghost"
                size="icon"
                aria-label={tg('addGoal')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleArchive}
                variant="ghost"
                size="icon"
                disabled={isPending}
                aria-label={tg('withdraw')}
              >
                <Archive className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Summary label={t('saved')} value={`${progress.saved.toFixed(2)}${symbol}`} />
          <Summary label={t('target')} value={`${progress.targetAmount.toFixed(2)}${symbol}`} />
          <Summary label={t('remaining')} value={`${progress.remaining.toFixed(2)}${symbol}`} />
          {progress.requiredMonthly != null ? (
            <Summary
              label={t('required')}
              value={`${progress.requiredMonthly.toFixed(2)}${symbol}`}
            />
          ) : (
            <Summary
              label={t('projected')}
              value={
                progress.projectedDate
                  ? format(new Date(progress.projectedDate), 'MMM yyyy')
                  : '—'
              }
            />
          )}
        </CardContent>
      </Card>

      {contributions.length > 0 && (
        <GoalProgressChart
          contributions={contributions}
          targetAmount={progress.targetAmount}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {contributions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('historyEmpty')}
            </p>
          ) : (
            <ul className="divide-y">
              {[...contributions].reverse().map((c) => {
                const isWithdrawal = c.amount < 0
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {isWithdrawal ? t('withdrawal') : t('contribution')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(c.date), 'dd MMM yyyy')}
                        {c.reason ? ` · ${c.reason}` : ''}
                      </p>
                    </div>
                    <span
                      className={
                        isWithdrawal
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : 'font-semibold text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {isWithdrawal ? '' : '+'}
                      {c.amount.toFixed(2)}
                      {symbol}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <GoalContributeDialog
        open={movementMode !== null}
        onOpenChange={(open) => !open && setMovementMode(null)}
        mode={movementMode ?? 'contribute'}
        onSubmit={handleMovement}
        isSubmitting={isPending}
      />

      {!isReserve && (
        <GoalDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          goal={goal}
          onSubmit={handleEdit}
          isSubmitting={isPending}
        />
      )}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
