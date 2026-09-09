import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockValidate, mockIssueCode, mockRevokeGrant } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockValidate: vi.fn(),
  mockIssueCode: vi.fn(),
  mockRevokeGrant: vi.fn(),
  mockPrisma: {
    mcpOAuthGrant: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/mcp-oauth', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/mcp-oauth')>()
  return {
    ...actual,
    validateAuthorizationRequest: mockValidate,
    issueAuthorizationCode: mockIssueCode,
    revokeGrant: mockRevokeGrant,
  }
})

import { OAuthRequestError } from '@/lib/services/mcp-oauth'
import { approveAuthorization, denyAuthorization, listConnectedApps, revokeConnectedApp } from './mcp-oauth-actions'

const USER_ID = 'user-1'
const PARAMS = { client_id: 'c', redirect_uri: 'https://claude.ai/cb', state: 's' }
const REQUEST = {
  client: { id: 'c', name: 'Claude' },
  redirectUri: 'https://claude.ai/cb',
  scopes: ['read', 'write'] as ('read' | 'write')[],
  codeChallenge: 'x'.repeat(43),
  state: 's',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
  mockValidate.mockResolvedValue({ ok: true, request: REQUEST })
  mockIssueCode.mockResolvedValue('https://claude.ai/cb?code=abc&state=s')
})

describe('approveAuthorization', () => {
  it('rejects unauthenticated users before touching the request', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await approveAuthorization(PARAMS, { allowWrite: true })).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockValidate).not.toHaveBeenCalled()
  })

  it('re-validates the raw params and issues a code for the signed-in user', async () => {
    const result = await approveAuthorization(PARAMS, { allowWrite: false })
    expect(result).toEqual({ success: true, data: { redirectTo: 'https://claude.ai/cb?code=abc&state=s' } })
    expect(mockValidate).toHaveBeenCalledWith(PARAMS)
    expect(mockIssueCode).toHaveBeenCalledWith(REQUEST, USER_ID, ['read'])
  })

  it('grants write only when the user allowed it', async () => {
    await approveAuthorization(PARAMS, { allowWrite: true })
    expect(mockIssueCode).toHaveBeenCalledWith(REQUEST, USER_ID, ['read', 'write'])
  })

  it('surfaces display errors and forwards redirect errors', async () => {
    mockValidate.mockResolvedValueOnce({
      ok: false,
      failure: { kind: 'display', error: new OAuthRequestError('invalid_client', 'Unknown client', 401) },
    })
    expect(await approveAuthorization(PARAMS, { allowWrite: true })).toEqual({ success: false, error: 'Unknown client' })

    mockValidate.mockResolvedValueOnce({
      ok: false,
      failure: { kind: 'redirect', error: new OAuthRequestError('invalid_scope', 'x'), redirectTo: 'https://claude.ai/cb?error=invalid_scope' },
    })
    expect(await approveAuthorization(PARAMS, { allowWrite: true })).toEqual({
      success: true,
      data: { redirectTo: 'https://claude.ai/cb?error=invalid_scope' },
    })
    expect(mockIssueCode).not.toHaveBeenCalled()
  })
})

describe('denyAuthorization', () => {
  it('sends the user back with access_denied and the state, issuing nothing', async () => {
    const result = await denyAuthorization(PARAMS)
    expect(result).toEqual({ success: true, data: { redirectTo: 'https://claude.ai/cb?error=access_denied&state=s' } })
    expect(mockIssueCode).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await denyAuthorization(PARAMS)).toEqual({ success: false, error: 'Unauthorized' })
  })
})

describe('listConnectedApps', () => {
  it('lists only the current user’s live grants, flattening the client name', async () => {
    mockPrisma.mcpOAuthGrant.findMany.mockResolvedValue([
      { id: 'g1', scopes: ['read'], lastUsedAt: null, createdAt: new Date('2026-09-01'), client: { name: 'Claude' } },
    ])
    const result = await listConnectedApps()
    expect(result).toEqual({
      success: true,
      data: [{ id: 'g1', scopes: ['read'], lastUsedAt: null, createdAt: new Date('2026-09-01'), clientName: 'Claude' }],
    })
    const { where } = mockPrisma.mcpOAuthGrant.findMany.mock.calls[0][0]
    expect(where).toMatchObject({ userId: USER_ID, revokedAt: null })
    expect(where.refreshExpiresAt.gt).toBeInstanceOf(Date)
  })

  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await listConnectedApps()).toEqual({ success: false, error: 'Unauthorized' })
  })
})

describe('revokeConnectedApp', () => {
  it('revokes an owned grant', async () => {
    mockPrisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g1' })
    expect(await revokeConnectedApp('g1')).toEqual({ success: true, data: undefined })
    expect(mockPrisma.mcpOAuthGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g1', userId: USER_ID } }))
    expect(mockRevokeGrant).toHaveBeenCalledWith('g1')
  })

  it('refuses a grant that belongs to someone else', async () => {
    mockPrisma.mcpOAuthGrant.findFirst.mockResolvedValue(null)
    expect(await revokeConnectedApp('g-other')).toEqual({ success: false, error: 'Connection not found or access denied' })
    expect(mockRevokeGrant).not.toHaveBeenCalled()
  })
})
