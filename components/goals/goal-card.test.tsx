import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import type { GoalProgress } from '@/lib/services/goal-math'
import type { GoalListItem, SerializedGoal } from '@/types/goal-types'
import { GoalCard } from './goal-card'

function makeGoal(over: Partial<SerializedGoal> = {}): SerializedGoal {
  return {
    id: 'goal-1',
    userId: 'user-1',
    name: 'New laptop',
    targetAmount: 1500,
    currency: 'GEL',
    targetDate: null,
    monthlyContribution: null,
    priority: 2,
    status: 'ACTIVE',
    isEmergencyFund: false,
    reserveStage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function makeProgress(over: Partial<GoalProgress> = {}): GoalProgress {
  return {
    saved: 500,
    targetAmount: 1500,
    remaining: 1000,
    percent: 33.3,
    monthsLeft: 4,
    requiredMonthly: 250,
    projectedDate: new Date(2027, 1, 24),
    status: 'on_track',
    ...over,
  }
}

function renderCard(item: GoalListItem) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GoalCard item={item} onContribute={vi.fn()} onWithdraw={vi.fn()} />
    </NextIntlClientProvider>
  )
}

describe('GoalCard status rendering', () => {
  it('renders the on_track badge', () => {
    renderCard({ goal: makeGoal(), progress: makeProgress({ status: 'on_track' }) })
    expect(screen.getByText('On track')).toBeInTheDocument()
  })

  it('renders the behind badge with concrete advice', () => {
    renderCard({
      goal: makeGoal(),
      progress: makeProgress({
        status: 'behind',
        behindAdvice: { increaseMonthlyBy: 125, orMoveDateTo: new Date(2027, 1, 24) },
      }),
    })
    expect(screen.getByText('Behind')).toBeInTheDocument()
    expect(screen.getByText(/\+125/)).toBeInTheDocument()
  })

  it('renders the achieved badge', () => {
    renderCard({
      goal: makeGoal(),
      progress: makeProgress({ status: 'achieved', percent: 100, saved: 1500, remaining: 0 }),
    })
    expect(screen.getByText('Achieved 🎉')).toBeInTheDocument()
  })
})
