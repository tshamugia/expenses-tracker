'use client'

/**
 * Currency Settings Component
 * Allows users to set their default currency preference
 */

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DollarSign, Euro, Coins } from 'lucide-react'
import { updateUserSettings } from '@/lib/actions/settings-actions'
import { toast } from 'sonner'
import type { UserSettings, Currency } from '@extracker/types'

interface CurrencySettingsProps {
  settings: UserSettings
}

const currencyInfo: Record<Currency, { label: string; symbol: string; icon: typeof DollarSign }> = {
  GEL: {
    label: 'Georgian Lari (₾)',
    symbol: '₾',
    icon: Coins,
  },
  USD: {
    label: 'US Dollar ($)',
    symbol: '$',
    icon: DollarSign,
  },
  EUR: {
    label: 'Euro (€)',
    symbol: '€',
    icon: Euro,
  },
}

export function CurrencySettings({ settings }: CurrencySettingsProps) {
  const [currency, setCurrency] = useState<Currency>(settings.defaultCurrency)
  const [isPending, startTransition] = useTransition()

  const handleCurrencyChange = (newCurrency: Currency) => {
    setCurrency(newCurrency)

    startTransition(async () => {
      const result = await updateUserSettings({
        defaultCurrency: newCurrency,
      })

      if (result.success) {
        toast.success('Currency updated successfully', {
          description: `Default currency set to ${currencyInfo[newCurrency].label}`,
        })
      } else {
        toast.error('Failed to update currency', {
          description: result.error,
        })
        // Revert on error
        setCurrency(settings.defaultCurrency)
      }
    })
  }

  const CurrentIcon = currencyInfo[currency].icon

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CurrentIcon className="h-5 w-5 text-primary" />
          <CardTitle>Currency Preference</CardTitle>
        </div>
        <CardDescription>
          Set your default currency for displaying expenses and statistics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currency">Default Currency</Label>
          <Select
            value={currency}
            onValueChange={handleCurrencyChange}
            disabled={isPending}
          >
            <SelectTrigger id="currency" className="w-full">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(currencyInfo).map(([key, info]) => {
                const Icon = info.icon
                return (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{info.label}</span>
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Your expenses will automatically convert to {currencyInfo[currency].label} for display
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
