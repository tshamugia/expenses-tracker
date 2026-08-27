'use client'

/**
 * Interest-vs-principal stacked bar chart (Phase 2 §6.2).
 * One bar per installment showing how the split shifts from mostly-interest to
 * mostly-principal over the life of the debt.
 */

import { useTranslations } from 'next-intl'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SerializedScheduleItem } from '@/types/debt-types'

interface DebtChartProps {
  schedule: SerializedScheduleItem[]
}

export function DebtChart({ schedule }: DebtChartProps) {
  const t = useTranslations('DebtDetail')

  const data = schedule.map((item) => ({
    seq: item.seq,
    interest: item.interestPart,
    principal: item.principalPart,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('chartTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="seq" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              labelFormatter={(label) => `#${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="interest"
              stackId="a"
              name={t('chartInterest')}
              fill="#f59e0b"
            />
            <Bar
              dataKey="principal"
              stackId="a"
              name={t('chartPrincipal')}
              fill="#3b82f6"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
