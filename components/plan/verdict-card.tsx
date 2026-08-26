'use client'

/**
 * Verdict card (Phase 4, §6.1 / §6.2 / R9). Shows the honest month verdict —
 * FORWARD / BACK / FLAT — with the component breakdown (debt principal, reserve,
 * goals, new debt). Reused on the dashboard live-preview and the close view.
 */

import { useTranslations } from 'next-intl'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/currency-helpers'
import type { VerdictKind } from '@/types/plan-types'

interface VerdictCardProps {
  kind: VerdictKind
  netChange: number
  components: { debt: number; reserve: number; goals: number; newDebt: number }
  currency: string
  plannedNetChange?: number
  compact?: boolean
}

export function VerdictCard({
  kind,
  netChange,
  components,
  currency,
  plannedNetChange,
  compact,
}: VerdictCardProps) {
  const t = useTranslations('Verdict')

  const tone =
    kind === 'FORWARD'
      ? 'text-emerald-600 dark:text-emerald-400'
      : kind === 'BACK'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
  const Icon = kind === 'FORWARD' ? ArrowUpRight : kind === 'BACK' ? ArrowDownRight : Minus
  const label = kind === 'FORWARD' ? t('forward') : kind === 'BACK' ? t('back') : t('flat')
  const sign = netChange > 0 ? '+' : ''

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-2 font-semibold', tone)}>
        <Icon className="h-5 w-5" />
        <span className={compact ? 'text-lg' : 'text-2xl'}>
          {label} {sign}
          {formatCurrency(netChange, currency)}
        </span>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-4">
          <Component label={t('debt')} value={components.debt} currency={currency} />
          <Component label={t('reserve')} value={components.reserve} currency={currency} />
          <Component label={t('goals')} value={components.goals} currency={currency} />
          <Component
            label={t('newDebt')}
            value={-components.newDebt}
            currency={currency}
          />
        </div>
      )}

      {!compact && plannedNetChange !== undefined && (
        <p className="text-xs text-muted-foreground">
          {t('plannedVsActual', {
            planned: formatCurrency(plannedNetChange, currency),
            actual: formatCurrency(netChange, currency),
          })}
        </p>
      )}
    </div>
  )
}

function Component({
  label,
  value,
  currency,
}: {
  label: string
  value: number
  currency: string
}) {
  const sign = value > 0 ? '+' : ''
  return (
    <div className="flex justify-between gap-2 tabular-nums">
      <span>{label}</span>
      <span className={value < 0 ? 'text-red-600 dark:text-red-400' : ''}>
        {sign}
        {formatCurrency(value, currency)}
      </span>
    </div>
  )
}
