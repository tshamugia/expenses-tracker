import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import { VerdictCard } from './verdict-card'

function renderCard(kind: 'FORWARD' | 'BACK' | 'FLAT', netChange: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VerdictCard
        kind={kind}
        netChange={netChange}
        components={{ debt: 180, reserve: 150, goals: 80, newDebt: 0 }}
        currency="GEL"
      />
    </NextIntlClientProvider>
  )
}

describe('VerdictCard', () => {
  it('renders the FORWARD visual', () => {
    renderCard('FORWARD', 410)
    expect(screen.getByText(/Forward/)).toBeInTheDocument()
  })

  it('renders the BACK visual', () => {
    renderCard('BACK', -150)
    expect(screen.getByText(/Back/)).toBeInTheDocument()
  })

  it('renders the FLAT visual', () => {
    renderCard('FLAT', 0)
    expect(screen.getByText(/Flat/)).toBeInTheDocument()
  })

  it('shows the component breakdown', () => {
    renderCard('FORWARD', 410)
    expect(screen.getByText('Debt principal')).toBeInTheDocument()
    expect(screen.getByText('Reserve')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('New debt')).toBeInTheDocument()
  })
})
