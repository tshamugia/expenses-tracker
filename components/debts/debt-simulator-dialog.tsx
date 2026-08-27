'use client'

/**
 * Prepayment simulator (Phase 2 §6.3).
 * Two tabs — "+X per month" and "one-time Y" — with a live result in two big
 * numbers (months earlier, interest saved) computed client-side from the stored
 * schedule via the pure engine. "Apply" confirms, then calls applyPrepayment
 * (the server recomputes authoritatively).
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  simulateExtraMonthly,
  simulateLumpSum,
  type ScheduleRow,
} from '@/lib/services/amortization'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { PrepaymentType, SerializedScheduleItem } from '@/types/debt-types'

interface DebtSimulatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: SerializedScheduleItem[]
  currentSeq: number | null
  annualRatePct: number
  currency: string
  onApply: (input: { type: PrepaymentType; amount: number }) => void | Promise<void>
  isApplying?: boolean
}

function toRows(schedule: SerializedScheduleItem[]): ScheduleRow[] {
  return schedule.map((s) => ({
    seq: s.seq,
    dueDate: new Date(s.dueDate),
    payment: s.payment,
    interestPart: s.interestPart,
    principalPart: s.principalPart,
    remainingPrincipal: s.remainingPrincipal,
  }))
}

function SimulatorBody({
  schedule,
  currentSeq,
  annualRatePct,
  currency,
  onApply,
  isApplying,
}: Omit<DebtSimulatorDialogProps, 'open' | 'onOpenChange'>) {
  const t = useTranslations('DebtSimulator')
  const [type, setType] = useState<PrepaymentType>('extra_monthly')
  const [amount, setAmount] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const symbol = getCurrencySymbol(currency as Currency)
  const rows = useMemo(() => toRows(schedule), [schedule])
  const currentEndDate = rows.length ? rows[rows.length - 1].dueDate : null

  const result = useMemo(() => {
    const value = Number(amount.replace(',', '.'))
    if (!currentSeq || !Number.isFinite(value) || value <= 0) return null
    try {
      return type === 'extra_monthly'
        ? simulateExtraMonthly(rows, currentSeq, value, annualRatePct)
        : simulateLumpSum(rows, currentSeq, value, annualRatePct)
    } catch {
      return null
    }
  }, [amount, type, rows, currentSeq, annualRatePct])

  const parsedAmount = Number(amount.replace(',', '.'))
  const canApply = !!result && Number.isFinite(parsedAmount) && parsedAmount > 0

  return (
    <div className="space-y-4">
      <Tabs
        value={type}
        onValueChange={(v) => {
          setType(v as PrepaymentType)
          setAmount('')
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="extra_monthly">{t('tabExtra')}</TabsTrigger>
          <TabsTrigger value="lump_sum">{t('tabLump')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-1.5">
        <Label htmlFor="sim-amount">
          {type === 'extra_monthly' ? t('extraLabel') : t('lumpLabel')}
        </Label>
        <Input
          id="sim-amount"
          autoFocus
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {result ? (
        <div className="space-y-1 rounded-lg border bg-muted/40 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {t('monthsSaved', { months: result.monthsSaved })}
          </p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {t('interestSaved', {
              amount: `${result.interestSaved.toFixed(2)}${symbol}`,
            })}
          </p>
          <p className="pt-1 text-sm text-muted-foreground">
            {t('newEndDate', { date: format(result.newEndDate, 'MMM yyyy') })}
          </p>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t('noEffect')}
        </p>
      )}

      <div className="flex justify-end">
        <Button disabled={!canApply || isApplying} onClick={() => setConfirmOpen(true)}>
          {t('apply')}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('applyTitle')}</DialogTitle>
            <DialogDescription>{t('applyDescription')}</DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                {t('currentEndDate', {
                  date: currentEndDate ? format(currentEndDate, 'MMM yyyy') : '—',
                })}
              </p>
              <p className="font-medium">
                {t('newEndDate', { date: format(result.newEndDate, 'MMM yyyy') })}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={isApplying}
              onClick={() => onApply({ type, amount: parsedAmount })}
            >
              {t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function DebtSimulatorDialog({
  open,
  onOpenChange,
  ...bodyProps
}: DebtSimulatorDialogProps) {
  const t = useTranslations('DebtSimulator')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <SimulatorBody {...bodyProps} />
      </DialogContent>
    </Dialog>
  )
}
