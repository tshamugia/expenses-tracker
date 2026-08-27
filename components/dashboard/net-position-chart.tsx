'use client'

/**
 * Net-position trend (Phase 4 §6.1 / R7) — a 6-month line of savings minus debt.
 * Trend > one month is the honest signal that things are improving.
 */

import { useTranslations } from 'next-intl'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, getCurrencySymbol } from '@/lib/utils/currency-helpers'

interface NetPositionChartProps {
  data: { month: string; net: number }[]
  currency: string
  current: number
}

export function NetPositionChart({ data, currency, current }: NetPositionChartProps) {
  const t = useTranslations('Dashboard')
  const symbol = getCurrencySymbol(currency)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('netPosition')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">
          {formatCurrency(current, currency)}
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{t('netPositionHint')}</p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                width={48}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${symbol}${v}`}
              />
              <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
              <Line
                type="monotone"
                dataKey="net"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
