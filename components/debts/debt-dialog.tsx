'use client'

/**
 * Add / edit a debt (Phase 2 §6.4 flow 1).
 * Create mode collects amount, rate, currency, first-payment date and either a
 * term or a monthly payment, with a live amortization preview (payment, total
 * interest, payoff date). Edit mode only allows the name and first-payment date
 * (per §5). Form state lives in an inner component that Radix unmounts on close.
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  buildSchedule,
  buildScheduleFromPayment,
  calcAnnuityPayment,
  summarizeSchedule,
} from '@/lib/services/amortization'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { SerializedDebt } from '@/types/debt-types'

export interface DebtFormData {
  name: string
  principal: number
  annualRatePct: number
  currency: string
  firstPaymentDate: Date
  termMonths?: number
  monthlyPayment?: number
}

interface DebtDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt?: SerializedDebt | null // present → edit mode
  onSubmit: (data: DebtFormData) => void | Promise<void>
  isSubmitting?: boolean
}

type Mode = 'term' | 'payment'

function num(value: string): number {
  return Number(value.replace(',', '.'))
}

function DebtForm({
  debt,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  debt?: SerializedDebt | null
  onSubmit: (data: DebtFormData) => void | Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}) {
  const t = useTranslations('DebtDialog')
  const isEdit = !!debt

  const [name, setName] = useState(debt?.name ?? '')
  const [principal, setPrincipal] = useState(debt ? String(debt.principal) : '')
  const [rate, setRate] = useState(debt ? String(debt.annualRatePct) : '')
  const [currency, setCurrency] = useState(debt?.currency ?? 'GEL')
  const [firstDate, setFirstDate] = useState(
    format(debt ? new Date(debt.firstPaymentDate) : new Date(), 'yyyy-MM-dd')
  )
  const [mode, setMode] = useState<Mode>('term')
  const [term, setTerm] = useState(debt ? String(debt.termMonths) : '')
  const [payment, setPayment] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Live amortization preview (create mode only)
  const preview = useMemo(() => {
    if (isEdit) return null
    const p = num(principal)
    const r = num(rate)
    const first = firstDate ? new Date(firstDate) : null
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(r) || r < 0 || !first) {
      return null
    }
    try {
      if (mode === 'term') {
        const tm = Number(term)
        if (!Number.isInteger(tm) || tm < 1) return null
        const schedule = buildSchedule({
          principal: p,
          annualRatePct: r,
          termMonths: tm,
          firstPaymentDate: first,
        })
        return {
          payment: calcAnnuityPayment(p, r, tm),
          summary: summarizeSchedule(schedule),
        }
      }
      const pay = num(payment)
      if (!Number.isFinite(pay) || pay <= 0) return null
      const schedule = buildScheduleFromPayment({
        principal: p,
        annualRatePct: r,
        monthlyPayment: pay,
        firstPaymentDate: first,
      })
      return { payment: pay, summary: summarizeSchedule(schedule) }
    } catch {
      return { error: t('errorPaymentTooLow') }
    }
  }, [isEdit, principal, rate, firstDate, mode, term, payment, t])

  const symbol = getCurrencySymbol(currency as Currency)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError(t('errorName'))

    const first = firstDate ? new Date(firstDate) : null
    if (!first || isNaN(first.getTime())) return setError(t('errorName'))

    if (isEdit) {
      setError(null)
      return onSubmit({
        name: name.trim(),
        principal: debt!.principal,
        annualRatePct: debt!.annualRatePct,
        currency,
        firstPaymentDate: first,
      })
    }

    const p = num(principal)
    if (!Number.isFinite(p) || p <= 0) return setError(t('errorPrincipal'))
    const r = num(rate)
    if (!Number.isFinite(r) || r < 0) return setError(t('errorRate'))

    if (mode === 'term') {
      const tm = Number(term)
      if (!Number.isInteger(tm) || tm < 1) return setError(t('errorTerm'))
      setError(null)
      return onSubmit({
        name: name.trim(),
        principal: p,
        annualRatePct: r,
        currency,
        firstPaymentDate: first,
        termMonths: tm,
      })
    }

    const pay = num(payment)
    if (!Number.isFinite(pay) || pay <= 0) return setError(t('errorPayment'))
    if (preview && 'error' in preview) return setError(preview.error as string)
    setError(null)
    return onSubmit({
      name: name.trim(),
      principal: p,
      annualRatePct: r,
      currency,
      firstPaymentDate: first,
      monthlyPayment: pay,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="debt-name">{t('nameLabel')}</Label>
        <Input
          id="debt-name"
          autoFocus
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {isEdit ? (
        <p className="text-xs text-muted-foreground">{t('editHint')}</p>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="debt-principal">{t('principalLabel')}</Label>
              <Input
                id="debt-principal"
                inputMode="decimal"
                placeholder="0.00"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="debt-currency">{t('currencyLabel')}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="debt-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GEL">₾ GEL</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                  <SelectItem value="EUR">€ EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-rate">{t('rateLabel')}</Label>
            <Input
              id="debt-rate"
              inputMode="decimal"
              placeholder="18"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('modeLabel')}</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="term">{t('modeTerm')}</TabsTrigger>
                <TabsTrigger value="payment">{t('modePayment')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === 'term' ? (
            <div className="space-y-1.5">
              <Label htmlFor="debt-term">{t('termLabel')}</Label>
              <Input
                id="debt-term"
                inputMode="numeric"
                placeholder="24"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="debt-payment">{t('paymentLabel')}</Label>
              <Input
                id="debt-payment"
                inputMode="decimal"
                placeholder="0.00"
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="debt-first-date">{t('firstPaymentLabel')}</Label>
        <Input
          id="debt-first-date"
          type="date"
          value={firstDate}
          onChange={(e) => setFirstDate(e.target.value)}
        />
      </div>

      {preview && !('error' in preview) && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-2 font-medium">{t('previewTitle')}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">{t('previewPayment')}</p>
              <p className="font-semibold">
                {preview.payment.toFixed(2)}
                {symbol}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('previewTotalInterest')}
              </p>
              <p className="font-semibold">
                {preview.summary.totalInterest.toFixed(2)}
                {symbol}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('previewEndDate')}</p>
              <p className="font-semibold">
                {preview.summary.endDate
                  ? format(preview.summary.endDate, 'MMM yyyy')
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {(error || (preview && 'error' in preview)) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? (preview as { error: string }).error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}

export function DebtDialog({
  open,
  onOpenChange,
  debt,
  onSubmit,
  isSubmitting = false,
}: DebtDialogProps) {
  const t = useTranslations('DebtDialog')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{debt ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>
        <DebtForm
          debt={debt}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
