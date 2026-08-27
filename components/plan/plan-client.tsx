'use client'

/**
 * /plan orchestrator (Phase 4b — goal-driven, automatic).
 * The plan is computed from the user's goals; there is no manual confirm. The
 * page shows a single headline — "Set aside ₾X this month" — with live progress
 * toward X, a per-goal breakdown, the obligations paid first, Safe to spend, and
 * (for a still-open month) the close ritual with an honest verdict.
 * Business logic lives in plan-actions; this component only orchestrates.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Sparkles,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import {
  applyWindfall,
  closeMonth,
  generateMonthlyPlan,
  getClosePreview,
} from '@/lib/actions/plan-actions'
import type {
  ClosePreview,
  PlanConclusion,
  PlanView,
  SetAsideLine,
} from '@/types/plan-types'
import { VerdictCard } from './verdict-card'

interface PlanClientProps {
  initialPlan: PlanView | null
}

/** width % for a progress bar, clamped and divide-by-zero safe. */
function pct(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0
  return Math.min(100, Math.max(0, (part / whole) * 100))
}

export function PlanClient({ initialPlan }: PlanClientProps) {
  const t = useTranslations('Plan')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const plan = initialPlan
  const [closePreview, setClosePreview] = useState<ClosePreview | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  // --- no plan (rare — the plan is auto-generated; this is the fallback) ------
  const handleGenerate = () => {
    startTransition(async () => {
      const r = await generateMonthlyPlan()
      if (r.success) {
        toast.success(t('generated'))
        router.refresh()
      } else {
        toast.error(t('generateFailed'), { description: r.error })
      }
    })
  }

  if (!plan) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ClipboardList className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t('noPlanTitle')}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('noPlanDescription')}
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={isPending} className="gap-1">
            <Sparkles className="h-4 w-4" />
            {t('generate')}
          </Button>
        </div>
      </div>
    )
  }

  const cur = plan.defaultCurrency
  const status = plan.plan.status
  const sa = plan.setAside

  // --- close ritual ----------------------------------------------------------
  const openClose = () => {
    startTransition(async () => {
      const r = await getClosePreview(plan.plan.id)
      if (r.success && r.data) {
        setClosePreview(r.data)
        setAccepted(new Set(r.data.proposedConclusions.map((_, i) => i)))
      } else {
        toast.error(t('closeFailed'), { description: r.error })
      }
    })
  }

  const doClose = () => {
    if (!closePreview) return
    const conclusions: PlanConclusion[] = closePreview.proposedConclusions.filter(
      (_, i) => accepted.has(i)
    )
    startTransition(async () => {
      const r = await closeMonth(plan.plan.id, { conclusions })
      if (r.success) {
        toast.success(t('closed'))
        setClosePreview(null)
        router.refresh()
      } else {
        toast.error(t('closeFailed'), { description: r.error })
      }
    })
  }

  if (closePreview) {
    return (
      <CloseView
        preview={closePreview}
        accepted={accepted}
        onToggle={(i) =>
          setAccepted((prev) => {
            const next = new Set(prev)
            if (next.has(i)) next.delete(i)
            else next.add(i)
            return next
          })
        }
        onClose={doClose}
        onCancel={() => setClosePreview(null)}
        isPending={isPending}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <Badge variant={status === 'CLOSED' ? 'secondary' : 'default'}>
            {status === 'CLOSED' ? t('closedBadge') : t('activeBadge')}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">{plan.plan.month}</span>
      </div>

      {/* headline: set aside X this month */}
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          {sa.requiredSetAside <= 0 ? (
            <p className="text-muted-foreground">{t('nothingToSetAside')}</p>
          ) : (
            <>
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t('setAsideSubtitle')}
              </p>
              <p className="text-5xl font-bold tabular-nums text-primary">
                {t('setAsideTitle', {
                  amount: formatCurrency(sa.requiredSetAside, cur),
                })}
              </p>
              <div className="mx-auto max-w-md space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct(sa.actualSetAside, sa.requiredSetAside)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('setAsideProgress', {
                    saved: formatCurrency(sa.actualSetAside, cur),
                    required: formatCurrency(sa.requiredSetAside, cur),
                  })}
                </p>
              </div>
              {sa.achieved && (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('achievedBadge')}
                </Badge>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* infeasible warning */}
      {!sa.feasible && (
        <Card className="border-red-300 dark:border-red-900">
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              {t('infeasibleTitle', { amount: formatCurrency(sa.shortfall, cur) })}
            </div>
            <p className="text-sm text-muted-foreground">{t('infeasibleDescription')}</p>
            <Button asChild size="sm" variant="outline" className="gap-1">
              <Link href="/goals">
                <Target className="h-4 w-4" />
                {t('openGoals')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* safe to spend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('safeToSpendLabel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold tabular-nums">
            {t('safeToSpendDay', { amount: formatCurrency(plan.safeToSpendDay, cur) })}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('safeToSpendMonthLine', {
              remaining: formatCurrency(plan.safeToSpendMonth, cur),
            })}
          </p>
        </CardContent>
      </Card>

      {/* per-goal breakdown */}
      {sa.lines.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('perGoalTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sa.lines.map((line) => (
              <GoalLine key={line.refId ?? line.label} line={line} currency={cur} t={t} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* obligations (paid first) */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm">
          <span className="text-muted-foreground">{t('obligationsTitle')}</span>
          <div className="flex items-center gap-4 tabular-nums">
            <span className="font-semibold">{formatCurrency(sa.obligations, cur)}</span>
            <span className="text-muted-foreground">
              {t('availableForGoals')}: {formatCurrency(sa.availableForGoals, cur)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* windfall banner (income above forecast) */}
      {status === 'CONFIRMED' && plan.windfall && (
        <WindfallBanner
          planId={plan.plan.id}
          excess={plan.windfall.excess}
          toDebt={plan.windfall.toDebt}
          toGoals={plan.windfall.toGoals}
          toFree={plan.windfall.toFree}
          currency={cur}
          isPending={isPending}
          onDone={() => router.refresh()}
        />
      )}

      {/* actions */}
      {status === 'CONFIRMED' && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={isPending} className="gap-1">
            <Sparkles className="h-4 w-4" />
            {t('recalculate')}
          </Button>
          <Button onClick={openClose} disabled={isPending} size="lg">
            {t('closeButton')}
          </Button>
        </div>
      )}
    </div>
  )
}

// --- per-goal line -----------------------------------------------------------

function GoalLine({
  line,
  currency,
  t,
}: {
  line: SetAsideLine
  currency: string
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          {line.achieved && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {line.label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {t('goalSetAside', { amount: formatCurrency(line.saved, currency) })} ·{' '}
          {t('goalNeeds', { amount: formatCurrency(line.required, currency) })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            'h-full rounded-full transition-all ' +
            (line.achieved ? 'bg-emerald-600' : 'bg-primary')
          }
          style={{ width: `${pct(line.saved, line.required)}%` }}
        />
      </div>
    </div>
  )
}

// --- windfall banner ---------------------------------------------------------

function WindfallBanner({
  planId,
  excess,
  toDebt,
  toGoals,
  toFree,
  currency,
  isPending,
  onDone,
}: {
  planId: string
  excess: number
  toDebt: number
  toGoals: number
  toFree: number
  currency: string
  isPending: boolean
  onDone: () => void
}) {
  const t = useTranslations('Plan')
  const [busy, setBusy] = useState(false)

  const apply = () => {
    setBusy(true)
    void applyWindfall(planId, { toDebt, toGoals, toFree }).then((r) => {
      setBusy(false)
      if (r.success) {
        toast.success(t('windfallApplied'))
        onDone()
      } else {
        toast.error(t('windfallFailed'), { description: r.error })
      }
    })
  }

  return (
    <Card className="border-emerald-300 dark:border-emerald-900">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-5 w-5" />
          {t('windfallTitle', { amount: formatCurrency(excess, currency) })}
        </div>
        <p className="text-sm text-muted-foreground">{t('windfallDescription')}</p>
        <ul className="text-sm tabular-nums">
          <li>{t('windfallToDebt', { amount: formatCurrency(toDebt, currency) })}</li>
          <li>{t('windfallToGoals', { amount: formatCurrency(toGoals, currency) })}</li>
          <li>{t('windfallToFree', { amount: formatCurrency(toFree, currency) })}</li>
        </ul>
        <Button size="sm" onClick={apply} disabled={busy || isPending}>
          {t('windfallApply')}
        </Button>
      </CardContent>
    </Card>
  )
}

// --- close view --------------------------------------------------------------

function CloseView({
  preview,
  accepted,
  onToggle,
  onClose,
  onCancel,
  isPending,
}: {
  preview: ClosePreview
  accepted: Set<number>
  onToggle: (i: number) => void
  onClose: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const t = useTranslations('Plan')
  const cur = preview.defaultCurrency

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('closeTitle')}</h1>
        <span className="text-sm text-muted-foreground">{preview.plan.month}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t('closeDescription')}</p>

      {/* goals-funded summary for the month */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-2 font-semibold">
            {preview.achieved && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            {preview.achieved ? t('achievedBadge') : t('inProgressBadge')}
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {t('setAsideProgress', {
              saved: formatCurrency(preview.actualSetAside, cur),
              required: formatCurrency(preview.requiredSetAside, cur),
            })}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('verdictTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <VerdictCard
            kind={preview.verdict.kind}
            netChange={preview.verdict.netChange}
            components={preview.verdict.components}
            currency={cur}
            plannedNetChange={preview.plannedNetChange}
          />
          <div className="text-sm text-muted-foreground">
            {t('planCompletion')}: {Math.round(preview.completionPct)}%
          </div>
        </CardContent>
      </Card>

      {/* plan vs actual */}
      <Card>
        <CardContent className="space-y-1 pt-6">
          {preview.lines.map((l, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span>{l.label}</span>
              <div className="flex items-center gap-4 tabular-nums">
                <span>{formatCurrency(l.planned, cur)}</span>
                <span className="w-24 text-right text-muted-foreground">
                  {formatCurrency(l.actual, cur)}
                </span>
                <span
                  className={
                    'w-16 text-right ' +
                    (l.deltaPct != null && l.deltaPct > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground')
                  }
                >
                  {l.deltaPct != null ? `${l.deltaPct > 0 ? '+' : ''}${Math.round(l.deltaPct)}%` : '—'}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* conclusions */}
      {preview.proposedConclusions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('conclusionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview.proposedConclusions.map((c, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accepted.has(i)}
                  onChange={() => onToggle(i)}
                  className="h-4 w-4"
                />
                {t('raiseLimit', {
                  label: c.categoryName ?? c.categoryId,
                  amount: formatCurrency(c.delta, cur),
                })}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          {t('windfallDismiss')}
        </Button>
        <Button onClick={onClose} disabled={isPending} size="lg">
          {t('closeButton')}
        </Button>
      </div>
    </div>
  )
}
