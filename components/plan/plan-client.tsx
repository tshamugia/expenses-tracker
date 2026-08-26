'use client'

/**
 * /plan orchestrator (Phase 4 §6.2). Renders the plan lifecycle in four states:
 *  - no plan → one-tap generate CTA (ს1)
 *  - DRAFT → editable waterfall table + deficit resolution → Confirm
 *  - CONFIRMED → planned vs actual live, windfall banner (ს2), Close month
 *  - close ritual → plan vs actual, conclusions to accept, honest verdict (ს4)
 *  - CLOSED → the closed summary
 * Business logic lives in plan-actions; this component only orchestrates.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, ClipboardList, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import {
  applyWindfall,
  closeMonth,
  confirmPlan,
  generateMonthlyPlan,
  getClosePreview,
  reopenPlan,
} from '@/lib/actions/plan-actions'
import type {
  AllocationKind,
  ClosePreview,
  PlanConclusion,
  PlanView,
  SerializedAllocation,
} from '@/types/plan-types'
import { VerdictCard } from './verdict-card'

const SECTION_ORDER: AllocationKind[] = [
  'MANDATORY',
  'VARIABLE',
  'DEBT',
  'RESERVE',
  'GOAL',
  'FREE',
]

interface PlanClientProps {
  initialPlan: PlanView | null
}

export function PlanClient({ initialPlan }: PlanClientProps) {
  const t = useTranslations('Plan')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const plan = initialPlan
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [closePreview, setClosePreview] = useState<ClosePreview | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  // --- no plan ---------------------------------------------------------------
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

  const { defaultCurrency: cur } = plan
  const status = plan.plan.status

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

  // --- shared: allocations grouped by section --------------------------------
  const grouped = SECTION_ORDER.map((kind) => ({
    kind,
    items: plan.allocations.filter((a) => a.kind === kind),
  })).filter((g) => g.items.length > 0)

  const plannedOf = (a: SerializedAllocation) =>
    a.kind === 'FREE' ? a.planned : edits[a.id] ?? a.planned

  const nonFreeTotal = plan.allocations
    .filter((a) => a.kind !== 'FREE')
    .reduce((s, a) => s + plannedOf(a), 0)
  const computedFree = Math.round((plan.plan.forecastIncome - nonFreeTotal) * 100) / 100
  const hasDeficit = status === 'DRAFT' && computedFree < 0

  // --- confirm / reopen ------------------------------------------------------
  const handleConfirm = () => {
    const adjustments = plan.allocations
      .filter((a) => a.kind !== 'FREE' && edits[a.id] !== undefined && edits[a.id] !== a.planned)
      .map((a) => ({ allocationId: a.id, planned: edits[a.id] }))
    startTransition(async () => {
      const r = await confirmPlan(plan.plan.id, adjustments)
      if (r.success) {
        toast.success(t('confirmed'))
        router.refresh()
      } else {
        toast.error(t('confirmFailed'), { description: r.error })
      }
    })
  }

  const handleReopen = () => {
    startTransition(async () => {
      const r = await reopenPlan(plan.plan.id)
      if (r.success) router.refresh()
      else toast.error(r.error)
    })
  }

  // deficit quick-fix: shift a line down so the plan balances
  const applyQuickFix = (allocationId: string, newPlanned: number) => {
    setEdits((prev) => ({ ...prev, [allocationId]: Math.max(0, Math.round(newPlanned * 100) / 100) }))
  }

  const liveByAllocId = new Map(
    (plan.live ?? []).map((l) => [l.allocation.id, l.actual])
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <Badge variant={status === 'CONFIRMED' ? 'default' : 'secondary'}>
            {status === 'DRAFT'
              ? t('draftBadge')
              : status === 'CONFIRMED'
                ? t('confirmedBadge')
                : t('closedBadge')}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">{plan.plan.month}</span>
      </div>

      {/* forecast income */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('forecastIncome')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {formatCurrency(plan.plan.forecastIncome, cur)}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('stable')}: {formatCurrency(plan.plan.forecastStable, cur)} · {t('variable')}:{' '}
            {formatCurrency(plan.plan.forecastVariable, cur)}
          </p>
        </CardContent>
      </Card>

      {/* windfall banner (CONFIRMED, income above forecast) */}
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

      {/* deficit block */}
      {hasDeficit && (
        <DeficitBlock
          shortfall={-computedFree}
          allocations={plan.allocations}
          currency={cur}
          onQuickFix={applyQuickFix}
        />
      )}

      {/* allocation table */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          {grouped.map((section) => (
            <div key={section.kind} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`section${section.kind}` as `section${AllocationKind}`)}
              </h3>
              {section.items.map((a) => {
                const isFree = a.kind === 'FREE'
                const planned = isFree ? computedFree : plannedOf(a)
                const actual =
                  status === 'CONFIRMED'
                    ? liveByAllocId.get(a.id) ?? 0
                    : a.actual
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <span className={isFree ? 'font-semibold' : ''}>{a.label}</span>
                    <div className="flex items-center gap-4 tabular-nums">
                      {status === 'DRAFT' && !isFree ? (
                        <Input
                          type="number"
                          value={edits[a.id] ?? a.planned}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [a.id]: Number(e.target.value) }))
                          }
                          className="h-8 w-28 text-right"
                          aria-label={a.label}
                        />
                      ) : (
                        <span className={isFree ? 'font-semibold' : ''}>
                          {formatCurrency(Math.max(0, planned), cur)}
                        </span>
                      )}
                      {(status === 'CONFIRMED' || status === 'CLOSED') && actual != null && (
                        <span className="w-24 text-right text-muted-foreground">
                          {formatCurrency(actual, cur)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* actions */}
      <div className="flex justify-end gap-2">
        {status === 'DRAFT' && (
          <Button onClick={handleConfirm} disabled={isPending || hasDeficit} size="lg">
            {t('confirm')}
          </Button>
        )}
        {status === 'CONFIRMED' && (
          <>
            <Button variant="outline" onClick={handleReopen} disabled={isPending}>
              {t('reopen')}
            </Button>
            <Button onClick={openClose} disabled={isPending} size="lg">
              {t('closeButton')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// --- deficit block -----------------------------------------------------------

function DeficitBlock({
  shortfall,
  allocations,
  currency,
  onQuickFix,
}: {
  shortfall: number
  allocations: SerializedAllocation[]
  currency: string
  onQuickFix: (allocationId: string, newPlanned: number) => void
}) {
  const t = useTranslations('Plan')
  const goals = allocations.filter((a) => a.kind === 'GOAL')
  const variables = allocations.filter((a) => a.kind === 'VARIABLE')

  return (
    <Card className="border-red-300 dark:border-red-900">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5" />
          {t('deficitTitle', { amount: formatCurrency(shortfall, currency) })}
        </div>
        <p className="text-sm text-muted-foreground">{t('deficitDescription')}</p>
        <div className="flex flex-col gap-2">
          {goals.map((g) => (
            <div key={g.id} className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onQuickFix(g.id, 0)}>
                {t('optionPause', { label: g.label, amount: formatCurrency(g.planned, currency) })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onQuickFix(g.id, g.planned - shortfall)}
              >
                {t('optionReduce', { label: g.label })}
              </Button>
            </div>
          ))}
          {variables.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => onQuickFix(v.id, v.planned - shortfall)}
            >
              {t('optionTrim', { label: v.label })}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('resolveHint')}</p>
      </CardContent>
    </Card>
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
