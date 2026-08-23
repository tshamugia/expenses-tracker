'use client'

/**
 * /debts/[id] detail orchestrator (Phase 2 §6.2 / §6.3).
 * Header + progress, summary numbers, schedule table with "record payment",
 * interest-vs-principal chart, and the prepayment simulator. Mutations go
 * through server actions; the page re-fetches via router.refresh() on success.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Calculator, Pencil, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  applyPrepayment,
  archiveDebt,
  recordDebtPayment,
  updateDebt,
} from '@/lib/actions/debt-actions'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type {
  DebtDetail,
  PrepaymentType,
  SerializedScheduleItem,
} from '@/types/debt-types'
import { DebtChart } from './debt-chart'
import { DebtDialog, type DebtFormData } from './debt-dialog'
import { DebtScheduleTable } from './debt-schedule-table'
import { DebtSimulatorDialog } from './debt-simulator-dialog'

interface DebtDetailClientProps {
  detail: DebtDetail
}

export function DebtDetailClient({ detail }: DebtDetailClientProps) {
  const t = useTranslations('DebtDetail')
  const router = useRouter()
  const { debt, schedule, progress, currentSeq } = detail
  const symbol = getCurrencySymbol(debt.currency as Currency)

  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const statusLabel =
    debt.status === 'PAID_OFF'
      ? t('statusPaidOff')
      : debt.status === 'ARCHIVED'
        ? t('statusArchived')
        : t('statusActive')

  const handleRecordPayment = (item: SerializedScheduleItem) => {
    startTransition(async () => {
      const result = await recordDebtPayment(item.id)
      if (result.success) {
        toast.success(result.data?.paidOff ? t('debtClosed') : t('paymentRecorded'))
        router.refresh()
      } else {
        toast.error(t('recordFailed'), { description: result.error })
      }
    })
  }

  const handleApply = (input: { type: PrepaymentType; amount: number }) => {
    startTransition(async () => {
      const result = await applyPrepayment(debt.id, input)
      if (result.success) {
        toast.success(t('paymentRecorded'))
        setSimulatorOpen(false)
        router.refresh()
      } else {
        toast.error(t('recordFailed'), { description: result.error })
      }
    })
  }

  const handleEdit = (data: DebtFormData) => {
    startTransition(async () => {
      const result = await updateDebt(debt.id, {
        name: data.name,
        firstPaymentDate: data.firstPaymentDate,
      })
      if (result.success) {
        toast.success(t('debtUpdated'))
        setEditOpen(false)
        router.refresh()
      } else {
        toast.error(t('recordFailed'), { description: result.error })
      }
    })
  }

  const handleArchive = () => {
    startTransition(async () => {
      const result = await archiveDebt(debt.id)
      if (result.success) {
        toast.success(t('archived'))
        router.push('/debts')
      } else {
        toast.error(t('archiveFailed'), { description: result.error })
      }
    })
  }

  const percent = Math.round(progress.progressRatio * 100)
  const isActive = debt.status === 'ACTIVE'

  return (
    <div className="space-y-6">
      <Link
        href="/debts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{debt.name}</h1>
            <Badge variant={debt.status === 'PAID_OFF' ? 'secondary' : 'default'}>
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('progress', { paid: progress.paidCount, total: progress.totalCount })}
            {' · '}
            {percent}%
          </p>
        </div>
        <div className="flex gap-2">
          {isActive && (
            <Button onClick={() => setSimulatorOpen(true)} variant="outline" className="gap-1">
              <Calculator className="h-4 w-4" />
              {t('simulate')}
            </Button>
          )}
          <Button onClick={() => setEditOpen(true)} variant="ghost" size="icon" aria-label={t('edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          {isActive && (
            <Button
              onClick={handleArchive}
              variant="ghost"
              size="icon"
              disabled={isPending}
              aria-label={t('archive')}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary numbers */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Summary label={t('remainingPrincipal')} value={`${progress.remainingPrincipal.toFixed(2)}${symbol}`} />
          <Summary label={t('paidInterest')} value={`${progress.paidInterest.toFixed(2)}${symbol}`} />
          <Summary label={t('remainingInterest')} value={`${progress.remainingInterest.toFixed(2)}${symbol}`} />
          <Summary label={t('totalToPay')} value={`${progress.totalToPay.toFixed(2)}${symbol}`} />
        </CardContent>
      </Card>

      <DebtChart schedule={schedule} />

      <DebtScheduleTable
        schedule={schedule}
        currentSeq={currentSeq}
        currency={debt.currency}
        onRecordPayment={isActive ? handleRecordPayment : undefined}
        isRecording={isPending}
      />

      <DebtSimulatorDialog
        open={simulatorOpen}
        onOpenChange={setSimulatorOpen}
        schedule={schedule}
        currentSeq={currentSeq}
        annualRatePct={debt.annualRatePct}
        currency={debt.currency}
        onApply={handleApply}
        isApplying={isPending}
      />

      <DebtDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        debt={debt}
        onSubmit={handleEdit}
        isSubmitting={isPending}
      />
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
