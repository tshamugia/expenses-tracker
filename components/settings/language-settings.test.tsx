import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import { setLocale } from '@/lib/actions/locale-actions'
import { LanguageSettings } from './language-settings'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/actions/locale-actions', () => ({
  setLocale: vi.fn(),
}))

function renderComponent() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LanguageSettings />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(setLocale).mockReset()
  vi.mocked(setLocale).mockResolvedValue({ success: true, data: 'ka' })
})

describe('LanguageSettings', () => {
  it('offers English and Georgian options', () => {
    renderComponent()

    expect(screen.getByRole('button', { name: /English/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ქართული/ })).toBeInTheDocument()
  })

  it('switches to Georgian via the setLocale action', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: /ქართული/ }))

    await waitFor(() => expect(setLocale).toHaveBeenCalledWith('ka'))
  })

  it('does not call the action when the current language is clicked', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: /English/ }))

    expect(setLocale).not.toHaveBeenCalled()
  })
})
