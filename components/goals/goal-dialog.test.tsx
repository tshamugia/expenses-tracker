import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import { GoalDialog } from './goal-dialog'

const onSubmit = vi.fn()
const onOpenChange = vi.fn()

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GoalDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GoalDialog', () => {
  it('computes the required monthly contribution live from a target date', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Target amount'), '1500')
    fireEvent.change(screen.getByLabelText('Target date'), {
      target: { value: '2030-12-01' },
    })

    expect(screen.getByText(/You'll need/)).toBeInTheDocument()
  })

  it('computes the projected completion date live from a monthly amount', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Target amount'), '1500')
    await user.click(screen.getByRole('tab', { name: 'Monthly amount' }))
    await user.type(screen.getByLabelText('Monthly contribution'), '500')

    expect(screen.getByText(/Done by/)).toBeInTheDocument()
  })

  it('submits a deadline-based goal', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Name'), 'New laptop')
    await user.type(screen.getByLabelText('Target amount'), '1500')
    fireEvent.change(screen.getByLabelText('Target date'), {
      target: { value: '2030-12-01' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New laptop',
        targetAmount: 1500,
        monthlyContribution: null,
      })
    )
    expect(onSubmit.mock.calls[0][0].targetDate).toBeInstanceOf(Date)
  })
})
