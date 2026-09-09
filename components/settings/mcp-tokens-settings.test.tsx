import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import { createMcpToken, revokeMcpToken } from '@/lib/actions/mcp-token-actions'
import { revokeConnectedApp } from '@/lib/actions/mcp-oauth-actions'
import type { ConnectedAppItem, McpTokenListItem } from '@/types/mcp-types'
import { McpTokensSettings } from './mcp-tokens-settings'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/actions/mcp-token-actions', () => ({
  createMcpToken: vi.fn(),
  revokeMcpToken: vi.fn(),
}))

vi.mock('@/lib/actions/mcp-oauth-actions', () => ({
  revokeConnectedApp: vi.fn(),
}))

const MCP_URL = 'https://app.example.com/api/mcp'

const readToken: McpTokenListItem = {
  id: 'tok-read',
  name: 'Laptop',
  lastFour: 'a1b2',
  scopes: ['read'],
  lastUsedAt: new Date('2026-09-01T00:00:00Z'),
  expiresAt: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
}

const writeToken: McpTokenListItem = {
  id: 'tok-write',
  name: 'Desktop',
  lastFour: 'c3d4',
  scopes: ['read', 'write'],
  lastUsedAt: null,
  expiresAt: new Date('2027-01-01T00:00:00Z'),
  createdAt: new Date('2026-08-02T00:00:00Z'),
}

const claudeApp: ConnectedAppItem = {
  id: 'grant-1',
  clientName: 'Claude',
  scopes: ['read', 'write'],
  lastUsedAt: new Date('2026-09-05T00:00:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
}

function renderComponent(
  tokens: McpTokenListItem[] = [readToken, writeToken],
  connectedApps: ConnectedAppItem[] = []
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <McpTokensSettings tokens={tokens} connectedApps={connectedApps} mcpUrl={MCP_URL} />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('McpTokensSettings', () => {
  it('shows the endpoint, each token with its scope badge, and an empty state', () => {
    renderComponent()

    expect(screen.getByText(MCP_URL)).toBeInTheDocument()
    expect(screen.getByText('Laptop')).toBeInTheDocument()
    expect(screen.getByText('…a1b2')).toBeInTheDocument()
    expect(screen.getByText('read')).toBeInTheDocument()
    expect(screen.getByText('Desktop')).toBeInTheDocument()
    expect(screen.getByText('write')).toBeInTheDocument()
    expect(screen.getByText(/Never used/)).toBeInTheDocument()

    renderComponent([])
    expect(screen.getByText(/No tokens yet/)).toBeInTheDocument()
    expect(screen.getAllByText(/No apps connected yet/).length).toBeGreaterThan(0)
  })

  it('lists connected apps and disconnects one after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(revokeConnectedApp).mockResolvedValue({ success: true, data: undefined })
    renderComponent([], [claudeApp])

    const list = within(screen.getByTestId('connected-apps'))
    expect(list.getByText('Claude')).toBeInTheDocument()
    expect(list.getByText('write')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Disconnect Claude' }))
    expect(revokeConnectedApp).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(revokeConnectedApp).toHaveBeenCalledWith('grant-1'))
    await waitFor(() => expect(screen.queryByTestId('connected-apps')).not.toBeInTheDocument())
    expect(refresh).toHaveBeenCalled()
  }, 15_000)

  it('creates a token and shows the raw secret once', async () => {
    const user = userEvent.setup()
    vi.mocked(createMcpToken).mockResolvedValue({
      success: true,
      data: {
        token: 'ext_mcp_SECRET123',
        item: { ...readToken, id: 'tok-new', name: 'Phone', lastFour: '0123' },
      },
    })
    renderComponent([])

    await user.click(screen.getByRole('button', { name: /Generate token/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Phone')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createMcpToken).toHaveBeenCalledWith({ name: 'Phone', scopes: ['read'], expiresInDays: null })
    )
    expect(await screen.findByTestId('mcp-raw-token')).toHaveTextContent('ext_mcp_SECRET123')
    expect(screen.getByText(/claude mcp add --transport http extracker/)).toHaveTextContent(MCP_URL)

    // The new token appears in the list behind the dialog
    expect(screen.getByText('Phone')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refresh).toHaveBeenCalled()
  }, 15_000)

  it('validates the name before calling the action and surfaces server errors', async () => {
    const user = userEvent.setup()
    vi.mocked(createMcpToken).mockResolvedValue({ success: false, error: 'You can have at most 10 active tokens' })
    renderComponent([])

    await user.click(screen.getByRole('button', { name: /Generate token/ }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(within(dialog).getByText('Name is required')).toBeInTheDocument()
    expect(createMcpToken).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Name'), 'Phone')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByText('You can have at most 10 active tokens')).toBeInTheDocument()
  }, 15_000)

  it('revokes a token after inline confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(revokeMcpToken).mockResolvedValue({ success: true, data: undefined })
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'Revoke Laptop' }))
    expect(revokeMcpToken).not.toHaveBeenCalled()
    expect(screen.getByText('Revoke this token?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(revokeMcpToken).toHaveBeenCalledWith('tok-read'))
    await waitFor(() => expect(screen.queryByText('Laptop')).not.toBeInTheDocument())
    expect(screen.getByText('Desktop')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  }, 15_000)

  it('cancelling the confirmation keeps the token', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'Revoke Laptop' }))
    await user.click(screen.getByRole('button', { name: 'No' }))

    expect(revokeMcpToken).not.toHaveBeenCalled()
    expect(screen.getByText('Laptop')).toBeInTheDocument()
    expect(screen.queryByText('Revoke this token?')).not.toBeInTheDocument()
  }, 15_000)
})
