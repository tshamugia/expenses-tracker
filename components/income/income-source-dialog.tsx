'use client'

/**
 * Add/edit income source dialog (Phase 1 §6.1)
 * STABLE sources require an expected amount; expected day is optional.
 * Form state lives in an inner component that Radix unmounts on close,
 * so every open starts fresh from the `source` prop.
 */

import { useState } from 'react'
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
      setError('შეიყვანე წყაროს სახელი')
      return
    }

    const parsedAmount = amount.trim() ? Number(amount.replace(',', '.')) : null
    if (type === 'STABLE' && (!parsedAmount || parsedAmount <= 0)) {
      setError('სტაბილურ წყაროს სჭირდება მოსალოდნელი თანხა')
      return
    }
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setError('თანხა დადებითი რიცხვი უნდა იყოს')
      return
    }

    const parsedDay = day.trim() ? Number(day) : null
    if (parsedDay !== null && (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31)) {
      setError('რიცხვი 1-31 შუალედში უნდა იყოს')
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
        <Label htmlFor="source-name">სახელი</Label>
        <Input
          id="source-name"
          autoFocus
          placeholder="მაგ. ხელფასი"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="source-type">ტიპი</Label>
        <Select value={type} onValueChange={(v) => setType(v as 'STABLE' | 'VARIABLE')}>
          <SelectTrigger id="source-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STABLE">სტაბილური (ხელფასი)</SelectItem>
            <SelectItem value="VARIABLE">ცვლადი (პროექტები)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="source-amount">
            მოსალოდნელი თანხა{type === 'VARIABLE' ? ' (სურვილით)' : ''}
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
          <Label htmlFor="source-currency">ვალუტა</Label>
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
          <Label htmlFor="source-day">თვის რიცხვი (სურვილით)</Label>
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
          გაუქმება
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'ინახება…' : 'შენახვა'}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {source ? 'წყაროს რედაქტირება' : 'შემოსავლის წყაროს დამატება'}
          </DialogTitle>
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
