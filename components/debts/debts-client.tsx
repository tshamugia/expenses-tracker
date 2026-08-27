'use client'

/**
 * /debts list orchestrator (Phase 2 §6.1)
 * Summary card + debt cards (progress, remaining, payoff date) + avalanche/
 * snowball strategy block (≥2 active debts). Mutations go through server
 * actions; the page re-fetches via router.refresh() on success.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Landmark, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createDebt } from '@/lib/actions/debt-actions'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { DebtListItem, DebtsOverview } from '@/types/debt-types'
import { DebtDialog, type DebtFormData } from './debt-dialog'

interface DebtsClientProps {
  overview: DebtsOverview
}

export function DebtsClient({ overview }: DebtsClientProps) {
  const t = useTranslations('Debts')
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const symbol = getCurrencySymbol(overview.defaultCurrency as Currency)
  const hasDebts = overview.debts.length > 0

  const handleCreate = (data: DebtFormData) => {
    startTransition(async () => {
      const result = await createDebt(data)
      if (result.success) {
        toast.success(t('debtAdded'))
        setDialogOpen(false)
        router.refresh()
      } else {
        toast.error(t('saveFailed'), { description: result.error })
      }
    })
  }

  if (!hasDebts) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Landmark className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('emptyDescription')}
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            {t('addDebt')}
          </Button>
        </div>

        <DebtDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleCreate}
          isSubmitting={isPending}
        />
      </>
    )
  }

  const strategyName = (debtId: string) =>
    overview.debts.find((d) => d.debt.id === debtId)?.debt.name ?? ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button onClick={() => setDialogOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" />
          {t('addDebt')}
        </Button>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('summaryRemaining')}</p>
            <p className="text-xl font-bold">
              {overview.totalRemainingPrincipal.toFixed(2)}
              {symbol}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('summaryMonthly')}</p>
            <p className="text-xl font-bold">
              {overview.totalMonthlyPayment.toFixed(2)}
              {symbol}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('summaryNextPayment')}</p>
            {overview.nextPayment ? (
              <p className="text-xl font-bold">
                {overview.nextPayment.amount.toFixed(2)}
                {getCurrencySymbol(overview.nextPayment.currency as Currency)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {format(new Date(overview.nextPayment.dueDate), 'dd MMM')}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noNextPayment')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Strategy — only with ≥2 active debts */}
      {overview.strategy && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('strategyTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge>{t('strategyAvalanche')}</Badge>
                <span className="font-medium">
                  {strategyName(overview.strategy.avalancheFirstDebtId)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('strategyAvalancheHint')}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t('strategySnowball')}</Badge>
                <span className="font-medium">
                  {strategyName(overview.strategy.snowballFirstDebtId)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('strategySnowballHint')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debt cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {overview.debts.map((item) => (
          <DebtCard key={item.debt.id} item={item} />
        ))}
      </div>

      <DebtDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
        isSubmitting={isPending}
      />
    </div>
  )
}

function DebtCard({ item }: { item: DebtListItem }) {
  const t = useTranslations('Debts')
  const { debt, progress } = item
  const symbol = getCurrencySymbol(debt.currency as Currency)
  const percent = Math.round(progress.progressRatio * 100)
  const isPaidOff = debt.status === 'PAID_OFF'

  return (
    <Link href={`/debts/${debt.id}`} className="block">
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-base">{debt.name}</CardTitle>
          {isPaidOff ? (
            <Badge variant="secondary">{t('paidOff')}</Badge>
          ) : progress.isOverdue ? (
            <Badge variant="destructive">{t('overdue')}</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
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
          <p className="text-xs text-muted-foreground">
            {t('progressLabel', { percent })}
          </p>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t('remaining')}</p>
              <p className="font-semibold">
                {progress.remainingPrincipal.toFixed(0)}
                {symbol}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('monthly')}</p>
              <p className="font-semibold">
                {debt.monthlyPayment.toFixed(0)}
                {symbol}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('endDate')}</p>
              <p className="font-semibold">
                {progress.endDate ? format(new Date(progress.endDate), 'MMM yyyy') : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
