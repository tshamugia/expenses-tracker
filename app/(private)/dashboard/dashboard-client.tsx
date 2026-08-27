'use client'

/**
 * Dashboard (Phase 4 §6.1) — rebuilt around the plan.
 * Top to bottom: Safe to spend → month progress + live verdict → main goals
 * (stability stepper + debt-free + 3-month reserve) → debts → other goals →
 * net-position trend. Every amount is in the default currency.
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Landmark, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import type { DashboardData } from '@/types/plan-types'
import { SafeToSpend } from '@/components/dashboard/safe-to-spend'
import { StabilityStepper } from '@/components/dashboard/stability-stepper'
import { NetPositionChart } from '@/components/dashboard/net-position-chart'
import { VerdictCard } from '@/components/plan/verdict-card'

interface DashboardClientProps {
  data: DashboardData
}

export function DashboardClient({ data }: DashboardClientProps) {
  const t = useTranslations('Dashboard')
  const cur = data.defaultCurrency
  const fmtMonth = (d: Date | string | null) => (d ? format(new Date(d), 'MMM yyyy') : null)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* 1. Safe to spend */}
      <SafeToSpend
        hasPlan={data.hasPlan}
        safeToSpendDay={data.safeToSpendDay}
        safeToSpendMonth={data.safeToSpendMonth}
        spentFree={data.spentFree}
        currency={cur}
      />

      {/* 1b. Goal-driven set-aside headline */}
      {data.hasPlan && data.requiredSetAside > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {t('setAsideHeadline', { amount: formatCurrency(data.requiredSetAside, cur) })}
              </p>
              {data.achieved ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">{t('goalsFunded')}</Badge>
              ) : !data.feasible ? (
                <Badge variant="destructive">{t('goalsShort', { amount: formatCurrency(data.shortfall, cur) })}</Badge>
              ) : null}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={
                  'h-full rounded-full transition-all ' +
                  (data.achieved ? 'bg-emerald-600' : 'bg-primary')
                }
                style={{
                  width: `${Math.min(100, data.requiredSetAside > 0 ? (data.actualSetAside / data.requiredSetAside) * 100 : 0)}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('setAsideProgress', {
                saved: formatCurrency(data.actualSetAside, cur),
                required: formatCurrency(data.requiredSetAside, cur),
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 2. This month's progress + live verdict */}
      {data.hasPlan && data.liveVerdict && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('monthProgress')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.completionPct != null && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, data.completionPct)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('completion')}: {Math.round(data.completionPct)}%
                </p>
              </div>
            )}
            <VerdictCard
              kind={data.liveVerdict.kind}
              netChange={data.liveVerdict.netChange}
              components={data.liveVerdict.components}
              currency={cur}
            />
          </CardContent>
        </Card>
      )}

      {/* 3. Main goals: stability stepper + debt-free + reserve */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('stabilityPath')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <StabilityStepper stage={data.stability.stage} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MainGoal
              title={t('debtFree')}
              progressText={t('debtFreeProgress', {
                pct: Math.round(data.stability.debtFree.paidOrSavedPct),
                remaining: formatCurrency(data.stability.debtFree.remaining, cur),
              })}
              pct={data.stability.debtFree.paidOrSavedPct}
              caption={
                data.stability.debtFree.projectedDate
                  ? t('projected', { date: fmtMonth(data.stability.debtFree.projectedDate) ?? '' })
                  : t('noProjection')
              }
            />
            <MainGoal
              title={t('reserveGoal')}
              progressText={t('reserveProgressText', {
                pct: Math.round(data.stability.reserveProgress.paidOrSavedPct),
                remaining: formatCurrency(data.stability.reserveProgress.remaining, cur),
              })}
              pct={data.stability.reserveProgress.paidOrSavedPct}
              caption=""
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Debts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> {t('debtsTitle')}
          </CardTitle>
          <Link href="/debts" className="text-sm text-primary hover:underline">
            {t('viewDebts')}
          </Link>
        </CardHeader>
        <CardContent>
          {data.debts.totalRemainingPrincipal > 0 ? (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('totalRemaining')}</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(data.debts.totalRemainingPrincipal, cur)}
                </span>
              </div>
              {data.debts.nextPayment && (
                <p className="text-sm text-muted-foreground">
                  {t('nextPayment', {
                    amount: formatCurrency(data.debts.nextPayment.amount, data.debts.nextPayment.currency),
                    date: format(new Date(data.debts.nextPayment.dueDate), 'd MMM'),
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noDebts')}</p>
          )}
        </CardContent>
      </Card>

      {/* 5. Other goals */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" /> {t('otherGoals')}
          </CardTitle>
          <Link href="/goals" className="text-sm text-primary hover:underline">
            {t('viewGoals')}
          </Link>
        </CardHeader>
        <CardContent>
          {data.otherGoals.length > 0 ? (
            <ul className="space-y-2">
              {data.otherGoals.map((g) => (
                <li key={g.goalId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{g.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${g.percent}%` }} />
                    </div>
                    <Badge variant="secondary">{Math.round(g.percent)}%</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noGoals')}</p>
          )}
        </CardContent>
      </Card>

      {/* 6. Net position trend */}
      <NetPositionChart
        data={data.stability.netPositionTrend}
        currency={cur}
        current={data.stability.netPosition}
      />
    </div>
  )
}

function MainGoal({
  title,
  progressText,
  pct,
  caption,
}: {
  title: string
  progressText: string
  pct: number
  caption: string
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
      </div>
      <div className="my-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">{progressText}</p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </div>
  )
}
