'use client'

/**
 * Quick-add expense dialog (Phase 1 §6.2)
 * The 10-second flow: amount (autofocus, numeric keyboard) + category chips
 * (+ optional description). Enter submits. Presentational — the launcher
 * wires it to the server action, which keeps this component unit-testable.
 *
 * Form state lives in an inner component that Radix unmounts on close,
 * so every open starts with a fresh form (no reset effects needed).
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
import { cn } from '@/lib/utils'

export interface QuickAddCategory {
  id: string
  categoryName: string
  color: string
}

export interface QuickAddFormData {
  amount: number
  categoryId: string
  currency: string
  description?: string
}

interface QuickAddExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: QuickAddCategory[]
  onSubmit: (data: QuickAddFormData) => void | Promise<void>
  isSubmitting?: boolean
}

function QuickAddForm({
  categories,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  categories: QuickAddCategory[]
  onSubmit: (data: QuickAddFormData) => void | Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}) {
  const [amount, setAmount] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [currency, setCurrency] = useState('GEL')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Categories load async after open — fall back to the first one until the
  // user picks explicitly
  const categoryId = selectedCategoryId ?? categories[0]?.id ?? null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const parsedAmount = Number(amount.replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('შეიყვანე თანხა')
      return
    }
    if (!categoryId) {
      setError('აირჩიე კატეგორია')
      return
    }

    setError(null)
    await onSubmit({
      amount: parsedAmount,
      categoryId,
      currency,
      description: description.trim() || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="quick-add-amount">თანხა</Label>
          <Input
            id="quick-add-amount"
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="quick-add-currency">ვალუტა</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="quick-add-currency">
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
        <Label>კატეგორია</Label>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="კატეგორია">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={categoryId === category.id}
              onClick={() => setSelectedCategoryId(category.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                categoryId === category.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-accent'
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.categoryName}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-add-description">აღწერა (სურვილით)</Label>
        <Input
          id="quick-add-description"
          placeholder="მაგ. ლანჩი"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          {isSubmitting ? 'ინახება…' : 'შენახვა'}
        </Button>
      </div>
    </form>
  )
}

export function QuickAddExpenseDialog({
  open,
  onOpenChange,
  categories,
  onSubmit,
  isSubmitting = false,
}: QuickAddExpenseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ხარჯის დამატება</DialogTitle>
        </DialogHeader>
        <QuickAddForm
          categories={categories}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
