import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import type { DashboardData } from '@/types/plan-types'
import { DashboardClient } from './dashboard-client'

// Stub the heavy presentational children (recharts / ResizeObserver etc.) so the
// test focuses on the dashboard-client wiring, notably the windfall card.
vi.mock('@/components/dashboard/safe-to-spend', () => ({ SafeToSpend: () => null }))
vi.mock('@/components/dashboard/stability-stepper', () => ({ StabilityStepper: () => null }))
vi.mock('@/components/dashboard/net-position-chart', () => ({ NetPositionChart: () => null }))
vi.mock('@/components/plan/verdict-card', () => ({ VerdictCard: () => null }))

function makeData(over: Partial<DashboardData> = {}): DashboardData {
  return {
    hasPlan: true,
    currentMonth: '2026-09',
    safeToSpendMonth: 1000,
    safeToSpendDay: 33,
    spentFree: 0,
    daysLeft: 30,
    planStatus: 'CONFIRMED',
    completionPct: null,
    requiredSetAside: 0,
    actualSetAside: 0,
    achieved: false,
    feasible: true,
    shortfall: 0,
    liveVerdict: null,
    windfall: null,
    stability: {
      stage: 1,
      reserve: { saved: 0, oneMonthTarget: 0, threeMonthTarget: 0 },
      debtFree: { paidOrSavedPct: 0, remaining: 0, projectedDate: null },
      reserveProgress: { paidOrSavedPct: 0, remaining: 0, projectedDate: null },
      netPosition: 0,
      netPositionTrend: [],
      verdictHistory: [],
      defaultCurrency: 'GEL',
    },
    debts: { totalRemainingPrincipal: 0, nextPayment: null },
    otherGoals: [],
    defaultCurrency: 'GEL',
    ...over,
  }
}

function renderDashboard(data: DashboardData) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DashboardClient data={data} />
    </NextIntlClientProvider>
  )
}

describe('DashboardClient windfall recommendation', () => {
  it('renders the read-only windfall recommendation with deep-link CTAs', () => {
    renderDashboard(makeData({ windfall: { excess: 300, toDebt: 150, toGoals: 90, toFree: 60 } }))
    expect(screen.getByText(/Extra income/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pay down debt/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add to a goal/i })).toBeInTheDocument()
  })

  it('omits the windfall card when there is no excess income', () => {
    renderDashboard(makeData({ windfall: null }))
    expect(screen.queryByText(/Extra income/i)).not.toBeInTheDocument()
  })
})
