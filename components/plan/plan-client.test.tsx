import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import type { PlanView, SetAsidePlan } from '@/types/plan-types'
import { PlanClient } from './plan-client'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/actions/plan-actions', () => ({
  generateMonthlyPlan: vi.fn(),
  applyWindfall: vi.fn(),
  closeMonth: vi.fn(),
  getClosePreview: vi.fn(),
}))

function makeSetAside(over: Partial<SetAsidePlan> = {}): SetAsidePlan {
  return {
    requiredSetAside: 0,
    actualSetAside: 0,
    achieved: false,
    obligations: 0,
    availableForGoals: 0,
    feasible: true,
    shortfall: 0,
    lines: [],
    ...over,
  }
}

function makePlan(over: Partial<PlanView> = {}): PlanView {
  return {
    plan: {
      id: 'plan-1',
      userId: 'user-1',
      month: '2026-09',
      status: 'CONFIRMED',
      forecastIncome: 3000,
      forecastStable: 3000,
      forecastVariable: 0,
      actualIncome: null,
      safeToSpend: 1000,
      currency: 'GEL',
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    allocations: [],
    live: [],
    deficit: null,
    safeToSpendMonth: 1000,
    safeToSpendDay: 33,
    spentFree: 0,
    daysLeft: 30,
    windfall: null,
    setAside: makeSetAside(),
    defaultCurrency: 'GEL',
    ...over,
  }
}

function renderPlan(plan: PlanView | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PlanClient initialPlan={plan} />
    </NextIntlClientProvider>
  )
}

describe('PlanClient (goal-driven)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the generate fallback CTA when there is no plan', () => {
    renderPlan(null)
    expect(screen.getByText('No plan yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create this month/i })).toBeInTheDocument()
  })

  it('shows the "set aside X this month" headline with progress', () => {
    const plan = makePlan({
      setAside: makeSetAside({
        requiredSetAside: 800,
        actualSetAside: 200,
        obligations: 1500,
        availableForGoals: 1500,
        lines: [
          { refId: 'g-laptop', label: 'Laptop', kind: 'GOAL', required: 500, saved: 200, achieved: false },
          { refId: 'g-car', label: 'Car', kind: 'GOAL', required: 300, saved: 0, achieved: false },
        ],
      }),
    })
    renderPlan(plan)
    expect(screen.getByText('so every goal stays on schedule')).toBeInTheDocument()
    // per-goal breakdown renders each goal
    expect(screen.getByText('Laptop')).toBeInTheDocument()
    expect(screen.getByText('Car')).toBeInTheDocument()
    // not achieved → no funded badge
    expect(screen.queryByText(/Goals funded/i)).not.toBeInTheDocument()
  })

  it('shows the funded badge when the set-aside is achieved', () => {
    const plan = makePlan({
      setAside: makeSetAside({ requiredSetAside: 500, actualSetAside: 500, achieved: true }),
    })
    renderPlan(plan)
    expect(screen.getByText(/Goals funded/i)).toBeInTheDocument()
  })

  it('warns with the shortfall when the goals are infeasible this month', () => {
    const plan = makePlan({
      setAside: makeSetAside({
        requiredSetAside: 2000,
        actualSetAside: 0,
        availableForGoals: 1500,
        feasible: false,
        shortfall: 500,
      }),
    })
    renderPlan(plan)
    expect(screen.getByText(/Short by/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Adjust goals/i })).toBeInTheDocument()
  })

  it('offers the close-month action on an active plan', () => {
    renderPlan(makePlan())
    expect(screen.getByRole('button', { name: 'Close month' })).toBeInTheDocument()
  })
})
