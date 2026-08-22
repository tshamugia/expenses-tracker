'use client'

/**
 * Currency Calculator Component
 * Allows conversion between GEL, USD, and EUR
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CurrencyRate } from '@/lib/services/currency'

interface CurrencyCalculatorProps {
  usd: CurrencyRate | null
  eur: CurrencyRate | null
}

type CurrencyCode = 'GEL' | 'USD' | 'EUR'

export function CurrencyCalculator({ usd, eur }: CurrencyCalculatorProps) {
  const [fromAmount, setFromAmount] = useState<string>('100')
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('USD')
  const [toCurrency, setToCurrency] = useState<CurrencyCode>('GEL')

  if (!usd || !eur) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Currency Calculator</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load currency calculator
          </p>
        </CardContent>
      </Card>
    )
  }

  const convert = (amount: number, from: CurrencyCode, to: CurrencyCode): number => {
    if (from === to) return amount

    // Convert to GEL first
    let gelAmount = amount
    if (from === 'USD') {
      gelAmount = amount * usd.rate
    } else if (from === 'EUR') {
      gelAmount = amount * eur.rate
    }

    // Convert from GEL to target currency
    if (to === 'GEL') {
      return gelAmount
    } else if (to === 'USD') {
      return gelAmount / usd.rate
    } else if (to === 'EUR') {
      return gelAmount / eur.rate
    }

    return 0
  }

  const amount = parseFloat(fromAmount) || 0
  const result = convert(amount, fromCurrency, toCurrency)

  const handleSwapCurrencies = () => {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }

  const getCurrencySymbol = (code: CurrencyCode): string => {
    switch (code) {
      case 'GEL':
        return '₾'
      case 'USD':
        return '$'
      case 'EUR':
        return '€'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Currency Calculator</CardTitle>
        <p className="text-sm text-muted-foreground">
          Convert between GEL, USD, and EUR
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* From Currency */}
        <div className="space-y-2">
          <Label htmlFor="from-amount">From</Label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id="from-amount"
                type="number"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0.00"
                className="pr-8"
                min="0"
                step="0.01"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {getCurrencySymbol(fromCurrency)}
              </span>
            </div>
            <Select
              value={fromCurrency}
              onValueChange={(value) => setFromCurrency(value as CurrencyCode)}
            >
              <SelectTrigger className="w-20 shrink-0 sm:w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GEL">GEL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="icon"
            onClick={handleSwapCurrencies}
            className="rounded-full"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* To Currency */}
        <div className="space-y-2">
          <Label htmlFor="to-amount">To</Label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id="to-amount"
                type="text"
                value={result.toFixed(2)}
                readOnly
                className="pr-8 bg-muted"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {getCurrencySymbol(toCurrency)}
              </span>
            </div>
            <Select
              value={toCurrency}
              onValueChange={(value) => setToCurrency(value as CurrencyCode)}
            >
              <SelectTrigger className="w-20 shrink-0 sm:w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GEL">GEL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Exchange Rate Info */}
        <div className="pt-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">1 USD</span>
            <span className="font-medium">{usd.rateFormated} ₾</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">1 EUR</span>
            <span className="font-medium">{eur.rateFormated} ₾</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
