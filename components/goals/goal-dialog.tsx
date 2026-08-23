'use client'

/**
 * Add / edit a goal (Phase 3 §6.1).
 * The user plans by a deadline OR a monthly amount; the other side is computed
 * live (required-per-month ↔ projected-completion-date). Form state lives in an
 * inner component that Radix unmounts on close, so it resets between opens.
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInCalendarMonths, format } from 'date-fns'
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
  projectedCompletionDate,
  requiredMonthlyContribution,
} from '@/lib/services/goal-math'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { SerializedGoal } from '@/types/goal-types'

export interface GoalFormData {
  name: string
  targetAmount: number
  currency: string
  targetDate?: Date | null
  monthlyContribution?: number | null
}

interface GoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: SerializedGoal | null // present → edit mode
  onSubmit: (data: GoalFormData) => void | Promise<void>
  isSubmitting?: boolean
}

type Mode = 'date' | 'contribution'

function num(value: string): number {
  return Number(value.replace(',', '.'))
}

function GoalForm({
  goal,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  goal?: SerializedGoal | null
  onSubmit: (data: GoalFormData) => void | Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}) {
  const t = useTranslations('GoalDialog')

  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '')
  const [currency, setCurrency] = useState(goal?.currency ?? 'GEL')
  const [mode, setMode] = useState<Mode>(
    goal?.monthlyContribution != null && goal.targetDate == null
      ? 'contribution'
      : 'date'
  )
  const [date, setDate] = useState(
    goal?.targetDate ? format(new Date(goal.targetDate), 'yyyy-MM-dd') : ''
  )
  const [contribution, setContribution] = useState(
    goal?.monthlyContribution != null ? String(goal.monthlyContribution) : ''
  )
  const [error, setError] = useState<string | null>(null)

  const symbol = getCurrencySymbol(currency as Currency)

  // Live counterpart preview
  const preview = useMemo(() => {
    const amount = num(target)
    if (!Number.isFinite(amount) || amount <= 0) return null
    if (mode === 'date') {
      if (!date) return null
      const d = new Date(date)
      if (isNaN(d.getTime())) return null
      const monthsLeft = differenceInCalendarMonths(d, new Date())
      const required = requiredMonthlyContribution(amount, monthsLeft)
      return { kind: 'required' as const, value: `${required.toFixed(2)}${symbol}` }
    }
    const c = num(contribution)
    if (!Number.isFinite(c) || c <= 0) return null
    const projected = projectedCompletionDate(amount, c, new Date())
    if (!projected) return null
    return { kind: 'projected' as const, value: format(projected, 'MMM yyyy') }
  }, [target, mode, date, contribution, symbol])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError(t('errorName'))
    const amount = num(target)
    if (!Number.isFinite(amount) || amount <= 0) return setError(t('errorTarget'))

    if (mode === 'date') {
      if (!date) return setError(t('errorPlan'))
      const d = new Date(date)
      if (isNaN(d.getTime())) return setError(t('errorPlan'))
      setError(null)
      return onSubmit({
        name: name.trim(),
        targetAmount: amount,
        currency,
        targetDate: d,
        monthlyContribution: null,
      })
    }

    const c = num(contribution)
    if (!Number.isFinite(c) || c <= 0) return setError(t('errorContribution'))
    setError(null)
    return onSubmit({
      name: name.trim(),
      targetAmount: amount,
      currency,
      targetDate: null,
      monthlyContribution: c,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="goal-name">{t('nameLabel')}</Label>
        <Input
          id="goal-name"
          autoFocus
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="goal-target">{t('targetLabel')}</Label>
          <Input
            id="goal-target"
            inputMode="decimal"
            placeholder="0.00"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="goal-currency">{t('currencyLabel')}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="goal-currency">
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
        <Label>{t('modeLabel')}</Label>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="date">{t('modeDate')}</TabsTrigger>
            <TabsTrigger value="contribution">{t('modeContribution')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === 'date' ? (
        <div className="space-y-1.5">
          <Label htmlFor="goal-date">{t('dateLabel')}</Label>
          <Input
            id="goal-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="goal-contribution">{t('contributionLabel')}</Label>
          <Input
            id="goal-contribution"
            inputMode="decimal"
            placeholder="0.00"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
          />
        </div>
      )}

      {preview && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm font-medium">
          {preview.kind === 'required'
            ? t('previewRequired', { amount: preview.value })
            : t('previewProjected', { date: preview.value })}
        </p>
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

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  onSubmit,
  isSubmitting = false,
}: GoalDialogProps) {
  const t = useTranslations('GoalDialog')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>
        <GoalForm
          goal={goal}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
