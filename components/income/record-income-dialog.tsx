'use client'

/**
 * Record an income fact (Phase 1 §6.1) — source, amount, currency, date.
 * Form state lives in an inner component that Radix unmounts on close,
 * so every open starts fresh.
 */

import { useState } from 'react'
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
  const activeSources = sources.filter((s) => s.isActive)
  const first = activeSources[0]

  const [sourceId, setSourceId] = useState<string>(first?.id ?? NO_SOURCE)
  const [amount, setAmount] = useState(
    first?.type === 'STABLE' && first.expectedAmount ? String(first.expectedAmount) : ''
  )
  const [currency, setCurrency] = useState(first?.currency ?? 'GEL')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState<string | null>(null)

  const handleSourceChange = (value: string) => {
    setSourceId(value)
    const source = activeSources.find((s) => s.id === value)
    if (source?.type === 'STABLE' && source.expectedAmount) {
      setAmount(String(source.expectedAmount))
      setCurrency(source.currency)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const parsedAmount = Number(amount.replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('შეიყვანე თანხა')
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
      <div className="space-y-1.5">
        <Label htmlFor="income-source">წყარო</Label>
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
            <SelectItem value={NO_SOURCE}>სხვა / წყაროს გარეშე</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="income-amount">თანხა</Label>
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
          <Label htmlFor="income-currency">ვალუტა</Label>
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
        <Label htmlFor="income-date">თარიღი</Label>
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
          გაუქმება
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'ინახება…' : 'დაფიქსირება'}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>შემოსავლის დაფიქსირება</DialogTitle>
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
