'use client'

/**
 * The Safe to spend hero (Phase 4 §6.1 / R3) — the single most prominent number
 * on the dashboard. With a plan: the daily safe amount + the month remainder.
 * Without one: a one-tap CTA to create the month's plan.
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Sparkles, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency-helpers'

interface SafeToSpendProps {
  hasPlan: boolean
  safeToSpendDay: number
  safeToSpendMonth: number
  spentFree: number
  currency: string
}

export function SafeToSpend({
  hasPlan,
  safeToSpendDay,
  safeToSpendMonth,
  spentFree,
  currency,
}: SafeToSpendProps) {
  const t = useTranslations('Dashboard')

  if (!hasPlan) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <p className="text-muted-foreground">{t('noPlanHint')}</p>
          <Button asChild size="lg" className="gap-1">
            <Link href="/plan">
              <Sparkles className="h-4 w-4" />
              {t('createPlanCta')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const total = safeToSpendMonth + spentFree

  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t('safeToSpendTitle')}
        </p>
        <p className="mt-2 text-5xl font-bold tabular-nums text-primary">
          {t('perDay', { amount: formatCurrency(safeToSpendDay, currency) })}
        </p>
        <p className="mt-2 text-muted-foreground">
          {t('monthRemaining', {
            remaining: formatCurrency(safeToSpendMonth, currency),
            total: formatCurrency(total, currency),
          })}
        </p>
      </CardContent>
    </Card>
  )
}
