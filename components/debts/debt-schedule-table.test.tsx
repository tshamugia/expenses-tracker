import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import type { SerializedScheduleItem } from '@/types/debt-types'
import { DebtScheduleTable } from './debt-schedule-table'

const row = (
  seq: number,
  dueDate: Date,
  paid: boolean
): SerializedScheduleItem => ({
  id: `item-${seq}`,
  debtId: 'debt-1',
  seq,
  dueDate,
  payment: 249.62,
  interestPart: 75,
  principalPart: 174.62,
  remainingPrincipal: 4825.38,
  paid,
  paidAt: paid ? dueDate : null,
  paidAmount: paid ? 249.62 : null,
  transactionId: null,
})

const onRecordPayment = vi.fn()

function renderTable(
  schedule: SerializedScheduleItem[],
  currentSeq: number | null,
  now: Date
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DebtScheduleTable
        schedule={schedule}
        currentSeq={currentSeq}
        currency="GEL"
        onRecordPayment={onRecordPayment}
        now={now}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DebtScheduleTable', () => {
  it('renders paid, current and upcoming states', async () => {
    const schedule = [
      row(1, new Date(2026, 4, 15), true), // paid
      row(2, new Date(2026, 5, 15), false), // current (currentSeq = 2, future)
      row(3, new Date(2026, 6, 15), false), // upcoming
    ]
    renderTable(schedule, 2, new Date(2026, 5, 1))

    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()

    const recordButton = screen.getByRole('button', {
      name: 'Record payment for installment 2',
    })
    expect(recordButton).toBeInTheDocument()

    await userEvent.click(recordButton)
    expect(onRecordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ seq: 2 })
    )
  })

  it('marks a past-due unpaid installment as overdue', () => {
    const schedule = [row(2, new Date(2026, 5, 15), false)]
    renderTable(schedule, 2, new Date(2026, 7, 1)) // now is after the due date

    expect(screen.getByText('Overdue')).toBeInTheDocument()
    const tr = screen.getByText('Overdue').closest('tr')
    expect(tr).toHaveAttribute('data-status', 'overdue')
  })

  it('shows a check for paid rows and no record button when none is current', () => {
    const schedule = [row(1, new Date(2026, 4, 15), true)]
    renderTable(schedule, null, new Date(2026, 5, 1))

    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
