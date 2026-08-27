'use client'

/**
 * Contribute to / withdraw from a goal (Phase 3 §6.1, §6.3 flows 3 & 5).
 * Withdrawal is a deliberate action: the reason is mandatory and submit stays
 * disabled until it is filled in (warning-toned copy). Inner component so Radix
 * resets state on close.
 */

import { useState } from 'react'
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

export type GoalMovementMode = 'contribute' | 'withdraw'

export interface GoalMovementData {
  amount: number
  date: Date
  reason?: string
}

interface GoalContributeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: GoalMovementMode
  onSubmit: (data: GoalMovementData) => void | Promise<void>
  isSubmitting?: boolean
}

function num(value: string): number {
  return Number(value.replace(',', '.'))
}

function MovementForm({
  mode,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  mode: GoalMovementMode
  onSubmit: (data: GoalMovementData) => void | Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}) {
  const t = useTranslations('GoalContributeDialog')
  const isWithdraw = mode === 'withdraw'

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    Number.isFinite(num(amount)) &&
    num(amount) > 0 &&
    (!isWithdraw || reason.trim().length > 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = num(amount)
    if (!Number.isFinite(value) || value <= 0) return setError(t('errorAmount'))
    if (isWithdraw && !reason.trim()) return setError(t('errorReason'))
    const d = date ? new Date(date) : new Date()
    setError(null)
    return onSubmit({
      amount: value,
      date: isNaN(d.getTime()) ? new Date() : d,
      reason: isWithdraw ? reason.trim() : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isWithdraw && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t('withdrawHint')}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="movement-amount">{t('amountLabel')}</Label>
        <Input
          id="movement-amount"
          autoFocus
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="movement-date">{t('dateLabel')}</Label>
        <Input
          id="movement-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {isWithdraw && (
        <div className="space-y-1.5">
          <Label htmlFor="movement-reason">{t('reasonLabel')}</Label>
          <Input
            id="movement-reason"
            placeholder={t('reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
        <Button
          type="submit"
          variant={isWithdraw ? 'destructive' : 'default'}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting
            ? t('saving')
            : isWithdraw
              ? t('withdraw')
              : t('contribute')}
        </Button>
      </div>
    </form>
  )
}

export function GoalContributeDialog({
  open,
  onOpenChange,
  mode,
  onSubmit,
  isSubmitting = false,
}: GoalContributeDialogProps) {
  const t = useTranslations('GoalContributeDialog')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === 'withdraw' ? t('withdrawTitle') : t('contributeTitle')}
          </DialogTitle>
          {mode === 'withdraw' && (
            <DialogDescription className="sr-only">
              {t('withdrawHint')}
            </DialogDescription>
          )}
        </DialogHeader>
        <MovementForm
          mode={mode}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
