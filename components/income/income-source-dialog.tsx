'use client'

/**
 * Add/edit income source dialog (Phase 1 §6.1)
 * STABLE sources require an expected amount; expected day is optional.
 * Form state lives in an inner component that Radix unmounts on close,
 * so every open starts fresh from the `source` prop.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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

export interface IncomeSourceFormData {
  name: string
  type: 'STABLE' | 'VARIABLE'
  expectedAmount: number | null
  currency: string
  expectedDay: number | null
}

interface IncomeSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source?: SerializedIncomeSource | null // null/undefined = create
  onSubmit: (data: IncomeSourceFormData) => void | Promise<void>
  isSubmitting?: boolean
}

function IncomeSourceForm({
  source,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  source?: SerializedIncomeSource | null
  onSubmit: (data: IncomeSourceFormData) => void | Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}) {
  const t = useTranslations('IncomeSourceDialog')
  const [name, setName] = useState(source?.name ?? '')
  const [type, setType] = useState<'STABLE' | 'VARIABLE'>(
    (source?.type as 'STABLE' | 'VARIABLE') ?? 'STABLE'
  )
  const [amount, setAmount] = useState(
    source?.expectedAmount !== null && source?.expectedAmount !== undefined
      ? String(source.expectedAmount)
      : ''
  )
  const [currency, setCurrency] = useState(source?.currency ?? 'GEL')
  const [day, setDay] = useState(source?.expectedDay ? String(source.expectedDay) : '')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError(t('errorName'))
      return
    }

    const parsedAmount = amount.trim() ? Number(amount.replace(',', '.')) : null
    if (type === 'STABLE' && (!parsedAmount || parsedAmount <= 0)) {
      setError(t('errorStableAmount'))
      return
    }
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setError(t('errorAmountPositive'))
      return
    }

    const parsedDay = day.trim() ? Number(day) : null
    if (parsedDay !== null && (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31)) {
      setError(t('errorDayRange'))
      return
    }

    setError(null)
    await onSubmit({
      name: name.trim(),
      type,
      expectedAmount: parsedAmount,
      currency,
      expectedDay: parsedDay,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="source-name">{t('nameLabel')}</Label>
        <Input
          id="source-name"
          autoFocus
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="source-type">{t('typeLabel')}</Label>
        <Select value={type} onValueChange={(v) => setType(v as 'STABLE' | 'VARIABLE')}>
          <SelectTrigger id="source-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STABLE">{t('typeStable')}</SelectItem>
            <SelectItem value="VARIABLE">{t('typeVariable')}</SelectItem>
          </SelectContent>
        </Select>
        {type === 'STABLE' && (
          <p className="text-xs text-muted-foreground">{t('autoHint')}</p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="source-amount">
            {type === 'VARIABLE' ? t('expectedAmountOptional') : t('expectedAmount')}
          </Label>
          <Input
            id="source-amount"
            inputMode="decimal"
            placeholder="3500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="source-currency">{t('currency')}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="source-currency">
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

      {type === 'STABLE' && (
        <div className="space-y-1.5">
          <Label htmlFor="source-day">{t('dayLabel')}</Label>
          <Input
            id="source-day"
            inputMode="numeric"
            placeholder="5"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
      )}

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
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}

export function IncomeSourceDialog({
  open,
  onOpenChange,
  source,
  onSubmit,
  isSubmitting = false,
}: IncomeSourceDialogProps) {
  const t = useTranslations('IncomeSourceDialog')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{source ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>
        <IncomeSourceForm
          source={source}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
