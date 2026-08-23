import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import {
  GoalContributeDialog,
  type GoalMovementMode,
} from './goal-contribute-dialog'

const onSubmit = vi.fn()
const onOpenChange = vi.fn()

function renderDialog(mode: GoalMovementMode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GoalContributeDialog
        open
        onOpenChange={onOpenChange}
        mode={mode}
        onSubmit={onSubmit}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GoalContributeDialog', () => {
  it('keeps the withdraw button disabled until a reason is filled in', async () => {
    const user = userEvent.setup()
    renderDialog('withdraw')

    const submit = screen.getByRole('button', { name: 'Withdraw' })
    expect(submit).toBeDisabled()

    // amount alone is not enough — the reason is mandatory
    await user.type(screen.getByLabelText('Amount'), '200')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Reason'), 'Car repair')
    expect(submit).toBeEnabled()

    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 200, reason: 'Car repair' })
    )
  })

  it('has no reason field when contributing and enables on a valid amount', async () => {
    const user = userEvent.setup()
    renderDialog('contribute')

    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()

    const submit = screen.getByRole('button', { name: 'Add' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Amount'), '200')
    expect(submit).toBeEnabled()
  })
})
