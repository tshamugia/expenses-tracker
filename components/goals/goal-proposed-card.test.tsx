import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import type { GoalProgress } from '@/lib/services/goal-math'
import type { GoalListItem, SerializedGoal } from '@/types/goal-types'
import { GoalProposedCard } from './goal-proposed-card'

function makeGoal(over: Partial<SerializedGoal> = {}): SerializedGoal {
  return {
    id: 'goal-1',
    userId: 'user-1',
    name: 'New laptop',
    targetAmount: 1500,
    currency: 'GEL',
    targetDate: null,
    monthlyContribution: 250,
    priority: 2,
    status: 'PROPOSED',
    isEmergencyFund: false,
    reserveStage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function makeProgress(over: Partial<GoalProgress> = {}): GoalProgress {
  return {
    saved: 0,
    targetAmount: 1500,
    remaining: 1500,
    percent: 0,
    monthsLeft: null,
    requiredMonthly: null,
    projectedDate: new Date(2027, 1, 24),
    status: 'on_track',
    ...over,
  }
}

function renderCard(item: GoalListItem, handlers: Partial<{ onApprove: () => void; onDelete: () => void }> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GoalProposedCard
        item={item}
        onApprove={handlers.onApprove ?? vi.fn()}
        onDelete={handlers.onDelete ?? vi.fn()}
      />
    </NextIntlClientProvider>
  )
}

describe('GoalProposedCard', () => {
  it('shows the Proposed badge and analytics (price / monthly / payoff)', () => {
    renderCard({
      goal: makeGoal(),
      progress: makeProgress(),
      whatIf: { safeBefore: 1000, safeAfter: 750, deltaMonthly: 250 },
    })
    expect(screen.getByText('Proposed')).toBeInTheDocument()
    expect(screen.getByText('1500₾')).toBeInTheDocument() // price
    expect(screen.getByText('250₾')).toBeInTheDocument() // monthly
  })

  it('renders the what-if Safe-to-Spend impact', () => {
    renderCard({
      goal: makeGoal(),
      progress: makeProgress(),
      whatIf: { safeBefore: 1000, safeAfter: 750, deltaMonthly: 250 },
    })
    expect(screen.getByText(/lowers Safe-to-Spend by 250₾/)).toBeInTheDocument()
  })

  it('shows the no-impact message when the delta is zero', () => {
    renderCard({
      goal: makeGoal(),
      progress: makeProgress(),
      whatIf: { safeBefore: 0, safeAfter: 0, deltaMonthly: 0 },
    })
    expect(screen.getByText('No impact on Safe-to-Spend')).toBeInTheDocument()
  })

  it('fires onApprove when Approve is clicked', () => {
    const onApprove = vi.fn()
    renderCard(
      { goal: makeGoal(), progress: makeProgress() },
      { onApprove }
    )
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledOnce()
  })
})
