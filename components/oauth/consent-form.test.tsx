import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import { approveAuthorization, denyAuthorization } from '@/lib/actions/mcp-oauth-actions'
import { ConsentForm, type ConsentFormProps } from './consent-form'

vi.mock('@/lib/actions/mcp-oauth-actions', () => ({
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
}))

const PARAMS = { client_id: 'c', redirect_uri: 'https://claude.ai/api/mcp/auth_callback' }
const navigate = vi.fn()

function renderForm(overrides: Partial<ConsentFormProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ConsentForm
        params={PARAMS}
        clientName="Claude"
        redirectHost="claude.ai"
        isLoopback={false}
        requestedScopes={['read', 'write']}
        userEmail="me@example.com"
        navigate={navigate}
        {...overrides}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(approveAuthorization).mockResolvedValue({ success: true, data: { redirectTo: 'https://claude.ai/cb?code=1' } })
  vi.mocked(denyAuthorization).mockResolvedValue({ success: true, data: { redirectTo: 'https://claude.ai/cb?error=access_denied' } })
})

describe('ConsentForm', () => {
  it('shows who is asking, the redirect host and the requested permissions', () => {
    renderForm()
    expect(screen.getByText(/Claude wants to access/)).toBeInTheDocument()
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument()
    expect(screen.getByTestId('redirect-host')).toHaveTextContent('claude.ai')
    expect(screen.getByText('Read your finances')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Add expenses and transactions' })).toBeChecked()
    expect(screen.queryByText(/local address/)).not.toBeInTheDocument()
  })

  it('hides the write toggle when only read was requested and warns on loopback redirects', () => {
    renderForm({ requestedScopes: ['read'], isLoopback: true, redirectHost: 'localhost:3118' })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText(/local address/)).toBeInTheDocument()
  })

  it('approves with write when the toggle is on and follows the redirect', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://claude.ai/cb?code=1'))
    expect(approveAuthorization).toHaveBeenCalledWith(PARAMS, { allowWrite: true })
  })

  it('lets the user withhold write access', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(approveAuthorization).toHaveBeenCalledWith(PARAMS, { allowWrite: false }))
  })

  it('denies via the deny action', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied'))
    expect(denyAuthorization).toHaveBeenCalledWith(PARAMS)
    expect(approveAuthorization).not.toHaveBeenCalled()
  })

  it('shows an error and stays put when the action fails', async () => {
    const user = userEvent.setup()
    vi.mocked(approveAuthorization).mockResolvedValue({ success: false, error: 'Unknown client' })
    renderForm()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown client')
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })
})
