import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import { SafeToSpend } from './safe-to-spend'

function renderBlock(props: Partial<Parameters<typeof SafeToSpend>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SafeToSpend
        hasPlan
        safeToSpendDay={27}
        safeToSpendMonth={320}
        spentFree={430}
        currency="GEL"
        {...props}
      />
    </NextIntlClientProvider>
  )
}

describe('SafeToSpend', () => {
  it('renders the daily figure and month remainder when a plan exists', () => {
    renderBlock()
    expect(screen.getByText('Safe to spend')).toBeInTheDocument()
    expect(screen.getByText(/per day/)).toBeInTheDocument()
    // remainder / total (320 + 430 = 750)
    expect(screen.getByText(/left of/)).toBeInTheDocument()
  })

  it('renders the create-plan CTA when there is no plan', () => {
    renderBlock({ hasPlan: false })
    expect(screen.getByText('Create a plan to see your Safe to spend')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Create this month/i })).toBeInTheDocument()
  })
})
