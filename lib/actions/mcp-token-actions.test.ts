import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockIssue } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockIssue: vi.fn(),
  mockPrisma: {
    mcpAccessToken: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/mcp-auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/mcp-auth')>()
  return { ...actual, issueToken: mockIssue }
})

import { createMcpToken, listMcpTokens, revokeMcpToken } from './mcp-token-actions'

const USER_ID = 'user-1'
const ITEM = {
  id: 'tok-1',
  name: 'Laptop',
  lastFour: 'a1b2',
  scopes: ['read'],
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date('2026-09-09T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID } })
})

describe('listMcpTokens', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await listMcpTokens()).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockPrisma.mcpAccessToken.findMany).not.toHaveBeenCalled()
  })

  it('returns only the user\'s active tokens without the hash', async () => {
    mockPrisma.mcpAccessToken.findMany.mockResolvedValue([ITEM])

    const r = await listMcpTokens()

    expect(r).toEqual({ success: true, data: [ITEM] })
    const call = mockPrisma.mcpAccessToken.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ userId: USER_ID, revokedAt: null })
    expect(call.select).not.toHaveProperty('tokenHash')
  })
})

describe('createMcpToken', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await createMcpToken({ name: 'x', scopes: ['read'] })).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockIssue).not.toHaveBeenCalled()
  })

  it('validates the name', async () => {
    expect((await createMcpToken({ name: '   ', scopes: ['read'] })).success).toBe(false)
    expect((await createMcpToken({ name: 'x'.repeat(61), scopes: ['read'] })).success).toBe(false)
    expect(mockIssue).not.toHaveBeenCalled()
  })

  it.each([[0], [1.5], [-3], [365 * 5 + 1]])('rejects expiry of %s days', async (days) => {
    const r = await createMcpToken({ name: 'x', scopes: ['read'], expiresInDays: days })
    expect(r.success).toBe(false)
    expect(mockIssue).not.toHaveBeenCalled()
  })

  it('enforces the active-token cap', async () => {
    mockPrisma.mcpAccessToken.count.mockResolvedValue(10)
    const r = await createMcpToken({ name: 'x', scopes: ['read'] })
    expect(r).toEqual({ success: false, error: 'You can have at most 10 active tokens' })
    expect(mockIssue).not.toHaveBeenCalled()
  })

  it('issues the token with normalized scopes and expiry and returns the raw secret once', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'))
    try {
      mockPrisma.mcpAccessToken.count.mockResolvedValue(2)
      mockIssue.mockResolvedValue({ raw: 'ext_mcp_secret', id: 'tok-1', lastFour: 'cret' })
      mockPrisma.mcpAccessToken.findUniqueOrThrow.mockResolvedValue({ ...ITEM, scopes: ['read', 'write'] })

      const r = await createMcpToken({ name: '  Laptop ', scopes: ['write'], expiresInDays: 30 })

      expect(mockIssue).toHaveBeenCalledWith(USER_ID, 'Laptop', ['read', 'write'], new Date('2026-10-09T00:00:00Z'))
      expect(r).toEqual({
        success: true,
        data: { token: 'ext_mcp_secret', item: { ...ITEM, scopes: ['read', 'write'] } },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('issues a non-expiring read token by default', async () => {
    mockPrisma.mcpAccessToken.count.mockResolvedValue(0)
    mockIssue.mockResolvedValue({ raw: 'ext_mcp_secret', id: 'tok-1', lastFour: 'cret' })
    mockPrisma.mcpAccessToken.findUniqueOrThrow.mockResolvedValue(ITEM)

    await createMcpToken({ name: 'Desk', scopes: [] })

    expect(mockIssue).toHaveBeenCalledWith(USER_ID, 'Desk', ['read'], null)
  })
})

describe('revokeMcpToken', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await revokeMcpToken('tok-1')).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('refuses tokens that belong to someone else', async () => {
    mockPrisma.mcpAccessToken.findFirst.mockResolvedValue(null)

    const r = await revokeMcpToken('tok-x')

    expect(r).toEqual({ success: false, error: 'Token not found or access denied' })
    expect(mockPrisma.mcpAccessToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tok-x', userId: USER_ID } })
    )
    expect(mockPrisma.mcpAccessToken.update).not.toHaveBeenCalled()
  })

  it('sets revokedAt once and is idempotent', async () => {
    mockPrisma.mcpAccessToken.findFirst.mockResolvedValue({ id: 'tok-1', revokedAt: null })
    expect(await revokeMcpToken('tok-1')).toEqual({ success: true, data: undefined })
    expect(mockPrisma.mcpAccessToken.update).toHaveBeenCalledWith({
      where: { id: 'tok-1' },
      data: { revokedAt: expect.any(Date) },
    })

    mockPrisma.mcpAccessToken.update.mockClear()
    mockPrisma.mcpAccessToken.findFirst.mockResolvedValue({ id: 'tok-1', revokedAt: new Date() })
    expect(await revokeMcpToken('tok-1')).toEqual({ success: true, data: undefined })
    expect(mockPrisma.mcpAccessToken.update).not.toHaveBeenCalled()
  })
})
