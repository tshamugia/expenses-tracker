'use client'

/**
 * The emergency fund card (Phase 3 §6.1) — always first, visually distinct.
 * Shows the stage (1/2 or 2/2), a progress bar, the auto-target explanation
 * ("1 month of mandatory expense = 2,100₾", with a formula tooltip), and the
 * contribute / withdraw / recompute / advance-stage actions. The withdrawal is
 * deliberately warning-toned (handled by the shared dialog).
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HelpCircle, Minus, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { GoalListItem } from '@/types/goal-types'

interface ReserveCardProps {
  item: GoalListItem
  onContribute: () => void
  onWithdraw: () => void
  onRecalc: () => void
  onAdvance: () => void
  isBusy?: boolean
}

export function ReserveCard({
  item,
  onContribute,
  onWithdraw,
  onRecalc,
  onAdvance,
  isBusy,
}: ReserveCardProps) {
  const t = useTranslations('Goals')
  const tc = useTranslations('GoalDialog')
  const { goal, progress, reserve } = item
  const symbol = getCurrencySymbol(goal.currency as Currency)
  const percent = Math.round(progress.percent)
  const stage = reserve?.stage ?? 1
  const mandatoryMonthly = reserve?.mandatoryMonthly ?? 0

  const [advanceOpen, setAdvanceOpen] = useState(false)

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          {t('reserveStageLabel', { stage })}
        </CardTitle>
        <Button
          size="icon"
          variant="ghost"
          onClick={onRecalc}
          disabled={isBusy}
          aria-label={t('reserveRefresh')}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {progress.saved.toFixed(0)}
            {symbol} / {progress.targetAmount.toFixed(0)}
            {symbol}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('progressLabel', { percent })}
          </span>
        </div>

        <p
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title={t('reserveTooltip')}
        >
          {stage === 3
            ? t('reserveExplain3', { amount: `${(mandatoryMonthly * 3).toFixed(0)}${symbol}` })
            : t('reserveExplain', { amount: `${mandatoryMonthly.toFixed(0)}${symbol}` })}
          <HelpCircle className="h-3.5 w-3.5" />
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" className="gap-1" onClick={onContribute}>
            <Plus className="h-3.5 w-3.5" />
            {t('contribute')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={onWithdraw}
            disabled={progress.saved <= 0}
          >
            <Minus className="h-3.5 w-3.5" />
            {t('withdraw')}
          </Button>
          {stage === 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdvanceOpen(true)}
              disabled={isBusy}
            >
              {t('reserveAdvance')}
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('reserveAdvanceTitle')}</DialogTitle>
            <DialogDescription>{t('reserveAdvanceDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdvanceOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => {
                setAdvanceOpen(false)
                onAdvance()
              }}
            >
              {t('reserveAdvance')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
