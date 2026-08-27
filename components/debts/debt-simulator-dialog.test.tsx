import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import { buildSchedule } from '@/lib/services/amortization'
import type { SerializedScheduleItem } from '@/types/debt-types'
import { DebtSimulatorDialog } from './debt-simulator-dialog'

// A real 5000 @ 18% / 24m schedule, serialized like the server returns it
const schedule: SerializedScheduleItem[] = buildSchedule({
  principal: 5000,
  annualRatePct: 18,
  termMonths: 24,
  firstPaymentDate: new Date(2026, 0, 15),
}).map((r) => ({
  id: `item-${r.seq}`,
  debtId: 'debt-1',
  seq: r.seq,
  dueDate: r.dueDate,
  payment: r.payment,
  interestPart: r.interestPart,
  principalPart: r.principalPart,
  remainingPrincipal: r.remainingPrincipal,
  paid: false,
  paidAt: null,
  paidAmount: null,
  transactionId: null,
}))

const onApply = vi.fn()
const onOpenChange = vi.fn()

function renderSimulator() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DebtSimulatorDialog
        open
        onOpenChange={onOpenChange}
        schedule={schedule}
        currentSeq={1}
        annualRatePct={18}
        currency="GEL"
        onApply={onApply}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DebtSimulatorDialog', () => {
  it('prompts for an amount before anything is entered', () => {
    renderSimulator()
    expect(
      screen.getByText('Enter an amount to see the effect')
    ).toBeInTheDocument()
  })

  it('renders the two headline numbers for an extra monthly payment', async () => {
    const user = userEvent.setup()
    renderSimulator()

    await user.type(screen.getByLabelText('Extra per month'), '200')

    expect(screen.getByText(/months earlier/)).toBeInTheDocument()
    expect(screen.getByText(/saved in interest/)).toBeInTheDocument()
  })

  it('applies a lump-sum prepayment after confirmation', async () => {
    const user = userEvent.setup()
    renderSimulator()

    await user.click(screen.getByRole('tab', { name: 'One-time' }))
    await user.type(screen.getByLabelText('One-time amount'), '2000')

    // headline result is shown
    expect(screen.getByText(/saved in interest/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    // confirmation dialog
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onApply).toHaveBeenCalledWith({ type: 'lump_sum', amount: 2000 })
  })
})
