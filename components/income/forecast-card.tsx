'use client'

/**
 * Next-month income forecast card (Phase 1 §6.1)
 * Shows the conservative total with a stable/variable breakdown and the
 * method explanation. Reused on the dashboard in Phase 4.
 */

import { useTranslations } from 'next-intl'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { IncomeForecast } from '@/lib/services/income-forecast'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'

interface ForecastCardProps {
  forecast: IncomeForecast
  defaultCurrency: string
}

export function ForecastCard({ forecast, defaultCurrency }: ForecastCardProps) {
  const t = useTranslations('ForecastCard')
  const symbol = getCurrencySymbol(defaultCurrency as Currency)

  const methodLabel =
    forecast.method === 'no_history'
      ? t('methodNoHistory')
      : forecast.method === 'average_discounted'
        ? t('methodAverage', { months: forecast.monthsOfHistory })
        : t('methodMin', { months: forecast.monthsOfHistory })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-3xl font-bold">
          {forecast.total.toFixed(0)}
          {symbol}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('breakdown', {
            stable: `${forecast.stableTotal.toFixed(0)}${symbol}`,
            variable: `${forecast.variableEstimate.toFixed(0)}${symbol}`,
          })}
        </p>
        <p className="text-xs text-muted-foreground">{methodLabel}</p>
      </CardContent>
    </Card>
  )
}
