import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import { QuickAddExpenseDialog } from './quick-add-expense-dialog'

const CATEGORIES = [
  { id: 'cat-1', categoryName: 'Food', color: '#10b981' },
  { id: 'cat-2', categoryName: 'Transport', color: '#f59e0b' },
]

const onSubmit = vi.fn()
const onOpenChange = vi.fn()

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QuickAddExpenseDialog
        open
        onOpenChange={onOpenChange}
        categories={CATEGORIES}
        onSubmit={onSubmit}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuickAddExpenseDialog', () => {
  it('submits amount + selected category via the callback', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Amount'), '18')
    await user.click(screen.getByRole('option', { name: /Transport/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith({
      amount: 18,
      categoryId: 'cat-2',
      currency: 'GEL',
      description: undefined,
    })
  })

  it('defaults to the first category and includes the description', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Amount'), '7,50')
    await user.type(screen.getByLabelText(/Description/), 'Lunch')
    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledWith({
      amount: 7.5,
      categoryId: 'cat-1',
      currency: 'GEL',
      description: 'Lunch',
    })
  })

  it('shows a validation error for an empty amount and does not submit', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a non-positive amount', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Amount'), '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
