'use client'

/**
 * Cumulative-progress line chart (Phase 3 §6.2).
 * Walks the contribution/withdrawal ledger to a running "saved" balance and
 * plots it against a flat target reference line.
 */

import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SerializedContribution } from '@/types/goal-types'

interface GoalProgressChartProps {
  contributions: SerializedContribution[]
  targetAmount: number
}

export function GoalProgressChart({
  contributions,
  targetAmount,
}: GoalProgressChartProps) {
  const t = useTranslations('GoalDetail')

  // Running "saved" balance, accumulated through the reduce accumulator (no
  // render-time mutation of an outer variable).
  const data = contributions.reduce<{ date: string; saved: number }[]>(
    (acc, c) => {
      const prev = acc.length ? acc[acc.length - 1].saved : 0
      acc.push({
        date: format(new Date(c.date), 'dd MMM'),
        saved: Math.round((prev + c.amount) * 100) / 100,
      })
      return acc
    },
    []
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('chartTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              y={targetAmount}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{ value: t('chartTarget'), fontSize: 11, position: 'insideTopRight' }}
            />
            <Line
              type="monotone"
              dataKey="saved"
              name={t('chartSaved')}
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
