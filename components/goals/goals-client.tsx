'use client'

/**
 * /goals orchestrator (Phase 3 §6.1).
 * Reserve card first, then user goals in priority order with ↑↓ reordering.
 * Owns the add / contribute / withdraw dialogs and dispatches to server actions;
 * the page re-fetches via router.refresh() on success.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  advanceReserveStage,
  contributeToGoal,
  createGoal,
  recalcReserveTarget,
  reorderGoals,
  withdrawFromGoal,
} from '@/lib/actions/goal-actions'
import type { GoalsOverview } from '@/types/goal-types'
import { GoalCard } from './goal-card'
import {
  GoalContributeDialog,
  type GoalMovementData,
  type GoalMovementMode,
} from './goal-contribute-dialog'
import { GoalDialog, type GoalFormData } from './goal-dialog'
import { ReserveCard } from './reserve-card'

interface GoalsClientProps {
  overview: GoalsOverview
}

interface MovementTarget {
  goalId: string
  mode: GoalMovementMode
}

export function GoalsClient({ overview }: GoalsClientProps) {
  const t = useTranslations('Goals')
  const tm = useTranslations('GoalContributeDialog')
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [movement, setMovement] = useState<MovementTarget | null>(null)
  const [isPending, startTransition] = useTransition()

  const reserve = overview.goals.find((g) => g.goal.isEmergencyFund) ?? null
  const userGoals = useMemo(
    () => overview.goals.filter((g) => !g.goal.isEmergencyFund),
    [overview.goals]
  )

  const handleCreate = (data: GoalFormData) => {
    startTransition(async () => {
      const result = await createGoal(data)
      if (result.success) {
        toast.success(t('goalAdded'))
        setAddOpen(false)
        router.refresh()
      } else {
        toast.error(t('saveFailed'), { description: result.error })
      }
    })
  }

  const handleMovement = (data: GoalMovementData) => {
    if (!movement) return
    startTransition(async () => {
      const result =
        movement.mode === 'contribute'
          ? await contributeToGoal(movement.goalId, {
              amount: data.amount,
              date: data.date,
            })
          : await withdrawFromGoal(movement.goalId, {
              amount: data.amount,
              date: data.date,
              reason: data.reason ?? '',
            })
      if (result.success) {
        const achieved =
          movement.mode === 'contribute' &&
          'data' in result &&
          (result.data as { achieved?: boolean } | undefined)?.achieved
        toast.success(
          achieved
            ? tm('achieved')
            : movement.mode === 'contribute'
              ? tm('contributed')
              : tm('withdrawn')
        )
        setMovement(null)
        router.refresh()
      } else {
        toast.error(tm('failed'), { description: result.error })
      }
    })
  }

  const handleRecalc = () => {
    startTransition(async () => {
      const result = await recalcReserveTarget()
      if (result.success) {
        toast.success(t('reserveRefreshed'))
        router.refresh()
      } else {
        toast.error(t('reserveRefreshFailed'), { description: result.error })
      }
    })
  }

  const handleAdvance = (goalId: string) => {
    startTransition(async () => {
      const result = await advanceReserveStage(goalId)
      if (result.success) {
        toast.success(t('reserveAdvanced'))
        router.refresh()
      } else {
        toast.error(t('reserveAdvanceFailed'), { description: result.error })
      }
    })
  }

  const handleReorder = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= userGoals.length) return
    const ids = userGoals.map((g) => g.goal.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    startTransition(async () => {
      const result = await reorderGoals(ids)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(t('reorderFailed'), { description: result.error })
      }
    })
  }

  const hasUserGoals = userGoals.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button onClick={() => setAddOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" />
          {t('addGoal')}
        </Button>
      </div>

      {reserve && (
        <ReserveCard
          item={reserve}
          onContribute={() =>
            setMovement({ goalId: reserve.goal.id, mode: 'contribute' })
          }
          onWithdraw={() =>
            setMovement({ goalId: reserve.goal.id, mode: 'withdraw' })
          }
          onRecalc={handleRecalc}
          onAdvance={() => handleAdvance(reserve.goal.id)}
          isBusy={isPending}
        />
      )}

      {hasUserGoals ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {userGoals.map((item, index) => (
            <GoalCard
              key={item.goal.id}
              item={item}
              onContribute={() =>
                setMovement({ goalId: item.goal.id, mode: 'contribute' })
              }
              onWithdraw={() =>
                setMovement({ goalId: item.goal.id, mode: 'withdraw' })
              }
              onMoveUp={() => handleReorder(index, -1)}
              onMoveDown={() => handleReorder(index, 1)}
              isFirst={index === 0}
              isLast={index === userGoals.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('emptyDescription')}
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            {t('addGoal')}
          </Button>
        </div>
      )}

      <GoalDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleCreate}
        isSubmitting={isPending}
      />

      <GoalContributeDialog
        open={movement !== null}
        onOpenChange={(open) => !open && setMovement(null)}
        mode={movement?.mode ?? 'contribute'}
        onSubmit={handleMovement}
        isSubmitting={isPending}
      />
    </div>
  )
}
