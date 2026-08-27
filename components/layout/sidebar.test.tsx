import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import ka from '@/messages/ka.json'
import Sidebar from './sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

function renderSidebar(locale: 'en' | 'ka' = 'en') {
  const messages = locale === 'en' ? en : ka
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Sidebar isOpen onClose={() => {}} />
    </NextIntlClientProvider>
  )
}

describe('Sidebar', () => {
  it('mobile sheet has an accessible title and description', () => {
    renderSidebar()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('Menu')
    expect(dialog).toHaveAccessibleDescription('Main navigation')
  })

  it('mobile sheet shows only the "Menu" title, not the app name', () => {
    renderSidebar()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Menu')).toBeInTheDocument()
    expect(within(dialog).queryByText('Expense Tracker')).not.toBeInTheDocument()
  })

  it('mobile sheet has exactly one close button', () => {
    renderSidebar()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('button', { name: /close/i })).toHaveLength(1)
  })

  it('renders navigation links in English by default', () => {
    renderSidebar('en')

    for (const name of ['Dashboard', 'Income', 'Expenses', 'Categories']) {
      expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0)
    }
  })

  it('renders navigation links in Georgian', () => {
    renderSidebar('ka')

    for (const name of ['დაშბორდი', 'შემოსავალი', 'ხარჯები', 'კატეგორიები']) {
      expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('dialog')).toHaveAccessibleName('მენიუ')
  })
})
