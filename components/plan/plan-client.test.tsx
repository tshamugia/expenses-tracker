import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import type { PlanView, SerializedAllocation } from '@/types/plan-types'
import { PlanClient } from './plan-client'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/actions/plan-actions', () => ({
  generateMonthlyPlan: vi.fn(),
  confirmPlan: vi.fn(),
  applyWindfall: vi.fn(),
  closeMonth: vi.fn(),
  getClosePreview: vi.fn(),
  reopenPlan: vi.fn(),
}))

function alloc(over: Partial<SerializedAllocation>): SerializedAllocation {
  return {
    id: 'a',
    planId: 'plan-1',
    kind: 'MANDATORY',
    refId: null,
    label: 'Line',
    planned: 0,
    actual: null,
    ...over,
  }
}

function makePlan(over: Partial<PlanView> = {}): PlanView {
  return {
    plan: {
      id: 'plan-1',
      userId: 'user-1',
      month: '2026-09',
      status: 'DRAFT',
      forecastIncome: 2000,
      forecastStable: 2000,
      forecastVariable: 0,
      actualIncome: null,
      safeToSpend: 0,
      currency: 'GEL',
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    allocations: [],
    live: null,
    deficit: null,
    safeToSpendMonth: 0,
    safeToSpendDay: 0,
    spentFree: 0,
    daysLeft: 30,
    windfall: null,
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

describe('PlanClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the generate CTA when there is no plan', () => {
    renderPlan(null)
    expect(screen.getByText('No plan yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create this month/i })).toBeInTheDocument()
  })

  it('blocks Confirm while a draft is in deficit', () => {
    const plan = makePlan({
      allocations: [
        alloc({ id: 'm', kind: 'MANDATORY', label: 'Rent', planned: 1500 }),
        alloc({ id: 'g', kind: 'GOAL', label: 'Car', planned: 800 }),
        alloc({ id: 'free', kind: 'FREE', label: 'Safe to spend', planned: 0 }),
      ],
    })
    renderPlan(plan)
    // 2000 forecast < 1500 + 800 → deficit
    expect(screen.getByText(/doesn't fit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('enables Confirm after a deficit quick-fix pauses a goal', () => {
    const plan = makePlan({
      allocations: [
        alloc({ id: 'm', kind: 'MANDATORY', label: 'Rent', planned: 1500 }),
        alloc({ id: 'g', kind: 'GOAL', label: 'Car', planned: 800 }),
        alloc({ id: 'free', kind: 'FREE', label: 'Safe to spend', planned: 0 }),
      ],
    })
    renderPlan(plan)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    // Pause the goal → frees 800 → 2000 - 1500 = 500 free → balanced
    fireEvent.click(screen.getByRole('button', { name: /Pause Car/i }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  it('enables Confirm for a balanced draft', () => {
    const plan = makePlan({
      allocations: [
        alloc({ id: 'm', kind: 'MANDATORY', label: 'Rent', planned: 1000 }),
        alloc({ id: 'free', kind: 'FREE', label: 'Safe to spend', planned: 1000 }),
      ],
    })
    renderPlan(plan)
    expect(screen.queryByText(/doesn't fit/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  it('shows the windfall banner on a confirmed plan with excess income', () => {
    const plan = makePlan({
      plan: { ...makePlan().plan, status: 'CONFIRMED' },
      allocations: [alloc({ id: 'free', kind: 'FREE', label: 'Safe to spend', planned: 500 })],
      live: [],
      windfall: { excess: 300, toDebt: 150, toGoals: 90, toFree: 60 },
    })
    renderPlan(plan)
    expect(screen.getByText(/Extra income/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })
})
