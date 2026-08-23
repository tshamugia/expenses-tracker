/**
 * Currency Rates Display Component
 * Shows current USD and EUR exchange rates from NBG
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, DollarSign, Euro } from 'lucide-react'
import type { CurrencyRate } from '@/lib/services/currency'

interface CurrencyRatesProps {
  usd: CurrencyRate | null
  eur: CurrencyRate | null
  date: string | null
}

function RateItem({
  currency,
  icon: Icon,
  rate,
}: {
  currency: string
  icon: typeof DollarSign
  rate: CurrencyRate
}) {
  const isPositive = rate.diff > 0
  const TrendIcon = isPositive ? TrendingUp : TrendingDown

  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="p-2 rounded-full bg-primary/10 shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            1 {currency}
          </p>
          <p className="truncate text-xl font-bold sm:text-2xl">{rate.rateFormated} ₾</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`flex items-center gap-1 ${
            isPositive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          <TrendIcon className="h-4 w-4" />
          <span className="text-sm font-medium">{rate.diffFormated}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">vs yesterday</p>
      </div>
    </div>
  )
}

export function CurrencyRates({ usd, eur, date }: CurrencyRatesProps) {
  if (!usd || !eur) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Exchange Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load currency rates
          </p>
        </CardContent>
      </Card>
    )
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Exchange Rates (GEL)</CardTitle>
          {date && (
            <p className="text-xs text-muted-foreground">{formatDate(date)}</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          National Bank of Georgia
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <RateItem currency="USD" icon={DollarSign} rate={usd} />
        <RateItem currency="EUR" icon={Euro} rate={eur} />
      </CardContent>
    </Card>
  )
}
