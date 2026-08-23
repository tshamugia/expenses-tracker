'use client'

/**
 * Next-month income forecast card (Phase 1 §6.1)
 * Shows the conservative total with a stable/variable breakdown and the
 * method explanation. Reused on the dashboard in Phase 4.
 */

import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { IncomeForecast } from '@/lib/services/income-forecast'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'

interface ForecastCardProps {
  forecast: IncomeForecast
  defaultCurrency: string
}

function methodLabel(forecast: IncomeForecast): string {
  switch (forecast.method) {
    case 'no_history':
      return 'არასტაბილურ შემოსავალზე ჯერ ისტორია გროვდება (მინ. 3 თვე)'
    case 'average_discounted':
      return `ბოლო ${forecast.monthsOfHistory} თვის კონსერვატიული შეფასება (საშუალოს 75%)`
    case 'historical_min':
      return `ბოლო ${forecast.monthsOfHistory} თვის მინიმუმი — კონსერვატიული შეფასება`
  }
}

export function ForecastCard({ forecast, defaultCurrency }: ForecastCardProps) {
  const symbol = getCurrencySymbol(defaultCurrency as Currency)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          მომდევნო თვის პროგნოზი
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-3xl font-bold">
          {forecast.total.toFixed(0)}
          {symbol}
        </p>
        <p className="text-sm text-muted-foreground">
          სტაბილური {forecast.stableTotal.toFixed(0)}
          {symbol} + არასტაბილური {forecast.variableEstimate.toFixed(0)}
          {symbol}
        </p>
        <p className="text-xs text-muted-foreground">{methodLabel(forecast)}</p>
      </CardContent>
    </Card>
  )
}
