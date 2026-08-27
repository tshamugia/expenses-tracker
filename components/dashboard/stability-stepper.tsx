'use client'

/**
 * The stability path stepper (Phase 4 §6.1 / §7.6). Four rungs — buffer →
 * 1-month reserve → debt-free → 3-month reserve — with the current one
 * highlighted and cleared ones checked. Stage 4 means the whole path is done.
 */

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StabilityStage } from '@/types/plan-types'

interface StabilityStepperProps {
  stage: StabilityStage
}

const STEPS = ['stage0', 'stage1', 'stage2', 'stage3'] as const

export function StabilityStepper({ stage }: StabilityStepperProps) {
  const t = useTranslations('Dashboard')

  return (
    <div className="flex items-center justify-between gap-1">
      {STEPS.map((key, index) => {
        const done = stage > index
        const current = stage === index
        return (
          <div key={key} className="flex flex-1 flex-col items-center gap-1 text-center">
            <div
              data-state={done ? 'done' : current ? 'current' : 'todo'}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-emerald-500 bg-emerald-500 text-white',
                current && 'border-primary bg-primary/10 text-primary',
                !done && !current && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <span
              className={cn(
                'text-[11px] leading-tight',
                current ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {t(key)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
