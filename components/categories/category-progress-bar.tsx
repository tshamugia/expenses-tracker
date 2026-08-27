'use client'

/**
 * Category spend progress bar (Phase 1 §6.3)
 * Pure presentational: fill width follows spent/limit, color follows level.
 */

import { cn } from '@/lib/utils'

interface CategoryProgressBarProps {
  spent: number
  limit: number | null
  level: 'ok' | 'warning' | 'over'
}

const LEVEL_STYLES: Record<CategoryProgressBarProps['level'], string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  over: 'bg-red-500',
}

export function CategoryProgressBar({ spent, limit, level }: CategoryProgressBarProps) {
  const ratio = limit && limit > 0 ? spent / limit : 0
  const widthPercent = Math.min(100, Math.round(ratio * 100))

  return (
    <div
      role="progressbar"
      aria-valuenow={limit ? Math.round(ratio * 100) : 0}
      aria-valuemin={0}
      aria-valuemax={100}
      data-level={level}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn('h-full rounded-full transition-all', LEVEL_STYLES[level])}
        style={{ width: limit ? `${widthPercent}%` : '0%' }}
      />
    </div>
  )
}
