'use client'

/**
 * /income page orchestrator (Phase 1 §6.1)
 * Forecast card + source cards + current-month facts. Mutations go through
 * server actions; the page re-fetches via router.refresh() on success.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Pencil, Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  createIncomeSource,
  recordIncome,
  updateIncomeSource,
} from '@/lib/actions/income-actions'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { IncomeOverview, SerializedIncomeSource } from '@/types/income-types'
import { ForecastCard } from './forecast-card'
import { IncomeSourceDialog, type IncomeSourceFormData } from './income-source-dialog'
import { RecordIncomeDialog, type RecordIncomeFormData } from './record-income-dialog'

interface IncomeClientProps {
  overview: IncomeOverview
}

export function IncomeClient({ overview }: IncomeClientProps) {
  const t = useTranslations('Income')
  const router = useRouter()
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<SerializedIncomeSource | null>(null)
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const symbol = getCurrencySymbol(overview.defaultCurrency as Currency)
  const hasSources = overview.sources.length > 0

  const handleSourceSubmit = (data: IncomeSourceFormData) => {
    startTransition(async () => {
      const result = editingSource
        ? await updateIncomeSource(editingSource.id, {
            name: data.name,
            type: data.type,
            expectedAmount: data.expectedAmount,
            currency: data.currency,
            expectedDay: data.expectedDay,
          })
        : await createIncomeSource({
            name: data.name,
            type: data.type,
            expectedAmount: data.expectedAmount ?? undefined,
            currency: data.currency,
            expectedDay: data.expectedDay ?? undefined,
          })

      if (result.success) {
        toast.success(editingSource ? t('sourceUpdated') : t('sourceAdded'))
        setSourceDialogOpen(false)
        setEditingSource(null)
        router.refresh()
      } else {
        toast.error(t('saveFailed'), { description: result.error })
      }
    })
  }

  const handleToggleActive = (source: SerializedIncomeSource, isActive: boolean) => {
    startTransition(async () => {
      const result = await updateIncomeSource(source.id, { isActive })
      if (result.success) {
        toast.success(isActive ? t('sourceActivated') : t('sourceArchived'))
        router.refresh()
      } else {
        toast.error(t('saveFailed'), { description: result.error })
      }
    })
  }

  const handleRecordIncome = (data: RecordIncomeFormData) => {
    startTransition(async () => {
      const result = await recordIncome(data)
      if (result.success && result.data) {
        toast.success(t('incomeRecorded'), {
          description: t('monthTotalDescription', {
            total: `${result.data.monthTotal.toFixed(0)}${symbol}`,
          }),
        })
        setRecordDialogOpen(false)
        router.refresh()
      } else {
        toast.error(t('recordFailed'), { description: result.error })
      }
    })
  }

  if (!hasSources) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('emptyDescription')}
            </p>
          </div>
          <Button onClick={() => setSourceDialogOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            {t('addSource')}
          </Button>
        </div>

        <IncomeSourceDialog
          open={sourceDialogOpen}
          onOpenChange={setSourceDialogOpen}
          onSubmit={handleSourceSubmit}
          isSubmitting={isPending}
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button onClick={() => setRecordDialogOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" />
          {t('recordIncome')}
        </Button>
      </div>

      <ForecastCard forecast={overview.forecast} defaultCurrency={overview.defaultCurrency} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('sources')}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingSource(null)
              setSourceDialogOpen(true)
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            {t('add')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {overview.sources.map((source) => (
            <Card key={source.id} className={source.isActive ? '' : 'opacity-60'}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{source.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingSource(source)
                      setSourceDialogOpen(true)
                    }}
                    aria-label={t('editAria', { name: source.name })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={source.isActive}
                    onCheckedChange={(checked) => handleToggleActive(source, checked)}
                    aria-label={t('activeAria', { name: source.name })}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge variant={source.type === 'STABLE' ? 'default' : 'secondary'}>
                  {source.type === 'STABLE' ? t('stable') : t('variable')}
                </Badge>
                <div className="text-right text-sm text-muted-foreground">
                  {source.expectedAmount !== null && (
                    <span className="font-medium text-foreground">
                      {source.expectedAmount.toFixed(0)}
                      {getCurrencySymbol(source.currency as Currency)}
                    </span>
                  )}
                  {source.expectedDay && (
                    <span> · {t('dayOfMonth', { day: source.expectedDay })}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('currentMonth')}</h2>
          <span className="text-sm text-muted-foreground">
            {t('total')} <span className="font-semibold text-foreground">{overview.monthTotal.toFixed(0)}{symbol}</span>
          </span>
        </div>

        {overview.monthTransactions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t('emptyMonth')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {overview.monthTransactions.map((transaction) => (
              <Card key={transaction.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {transaction.incomeSourceName ?? transaction.description ?? t('incomeFallback')}
                      {transaction.entrySource === 'AUTO' && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {t('autoBadge')}
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(transaction.date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +{transaction.amount.toFixed(2)}
                    {getCurrencySymbol(transaction.currency as Currency)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <IncomeSourceDialog
        open={sourceDialogOpen}
        onOpenChange={(open) => {
          setSourceDialogOpen(open)
          if (!open) setEditingSource(null)
        }}
        source={editingSource}
        onSubmit={handleSourceSubmit}
        isSubmitting={isPending}
      />

      <RecordIncomeDialog
        open={recordDialogOpen}
        onOpenChange={setRecordDialogOpen}
        sources={overview.sources}
        onSubmit={handleRecordIncome}
        isSubmitting={isPending}
      />
    </div>
  )
}
