'use client'

/**
 * Record an income fact (Phase 1 §6.1) — source, amount, currency, date.
 * Only VARIABLE sources are offered: STABLE income is accrued automatically
 * every month by the accrual service, so manual entry is variable-only.
 * Form state lives in an inner component that Radix unmounts on close,
 * so every open starts fresh.
 */

import { useState } from 'react'
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
import type { SerializedIncomeSource } from '@/types/income-types'

export interface RecordIncomeFormData {
  incomeSourceId?: string
  amount: number
  currency: string
  date: Date
  description?: string
}

interface RecordIncomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: SerializedIncomeSource[]
  onSubmit: (data: RecordIncomeFormData) => void | Promise<void>
  isSubmitting?: boolean
}

const NO_SOURCE = 'none'

function RecordIncomeForm({
  sources,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  sources: SerializedIncomeSource[]
  onSubmit: (data: RecordIncomeFormData) => void | Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}) {
  const t = useTranslations('RecordIncomeDialog')
  // STABLE sources accrue automatically — only variable income is entered here
  const activeSources = sources.filter((s) => s.isActive && s.type === 'VARIABLE')
  const first = activeSources[0]

  const [sourceId, setSourceId] = useState<string>(first?.id ?? NO_SOURCE)
  const [amount, setAmount] = useState(
    first?.expectedAmount ? String(first.expectedAmount) : ''
  )
  const [currency, setCurrency] = useState(first?.currency ?? 'GEL')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState<string | null>(null)

  const handleSourceChange = (value: string) => {
    setSourceId(value)
    const source = activeSources.find((s) => s.id === value)
    if (source?.expectedAmount) {
      setAmount(String(source.expectedAmount))
      setCurrency(source.currency)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const parsedAmount = Number(amount.replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t('errorAmount'))
      return
    }

    setError(null)
    await onSubmit({
      incomeSourceId: sourceId === NO_SOURCE ? undefined : sourceId,
      amount: parsedAmount,
      currency,
      date: date ? new Date(date) : new Date(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('variableOnlyHint')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="income-source">{t('source')}</Label>
        <Select value={sourceId} onValueChange={handleSourceChange}>
          <SelectTrigger id="income-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeSources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name}
              </SelectItem>
            ))}
            <SelectItem value={NO_SOURCE}>{t('noSource')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="income-amount">{t('amount')}</Label>
          <Input
            id="income-amount"
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="income-currency">{t('currency')}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="income-currency">
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
        <Label htmlFor="income-date">{t('date')}</Label>
        <Input
          id="income-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : t('record')}
        </Button>
      </div>
    </form>
  )
}

export function RecordIncomeDialog({
  open,
  onOpenChange,
  sources,
  onSubmit,
  isSubmitting = false,
}: RecordIncomeDialogProps) {
  const t = useTranslations('RecordIncomeDialog')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <RecordIncomeForm
          sources={sources}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
