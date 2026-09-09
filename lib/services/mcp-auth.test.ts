import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mcpAccessToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))

import {
  generateRawToken,
  hashToken,
  issueToken,
  MCP_TOKEN_PREFIX,
  normalizeScopes,
  verifyToken,
} from './mcp-auth'

const PEPPER = 'unit-test-pepper'
const NOW = new Date('2026-09-09T12:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MCP_TOKEN_PEPPER = PEPPER
  mockPrisma.mcpAccessToken.update.mockResolvedValue({})
})

afterEach(() => {
  delete process.env.MCP_TOKEN_PEPPER
})

describe('hashToken', () => {
  it('is deterministic for the same pepper and differs across peppers', () => {
    const a = hashToken('ext_mcp_abc', 'p1')
    expect(a).toBe(hashToken('ext_mcp_abc', 'p1'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(hashToken('ext_mcp_abc', 'p2'))
    expect(a).not.toBe(hashToken('ext_mcp_abd', 'p1'))
  })

  it('throws when the pepper is missing', () => {
    delete process.env.MCP_TOKEN_PEPPER
    expect(() => hashToken('ext_mcp_abc')).toThrow(/MCP_TOKEN_PEPPER/)
  })
})

describe('generateRawToken', () => {
  it('produces prefixed, unique, url-safe tokens', () => {
    const t1 = generateRawToken()
    const t2 = generateRawToken()
    expect(t1.startsWith(MCP_TOKEN_PREFIX)).toBe(true)
    expect(t1).not.toBe(t2)
    expect(t1.slice(MCP_TOKEN_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('normalizeScopes', () => {
  it('always includes read, drops unknown scopes and duplicates', () => {
    expect(normalizeScopes([])).toEqual(['read'])
    expect(normalizeScopes(['write', 'write', 'admin'])).toEqual(['read', 'write'])
    expect(normalizeScopes(['read'])).toEqual(['read'])
  })
})

describe('issueToken', () => {
  it('stores only the hash + last four and returns the raw token once', async () => {
    mockPrisma.mcpAccessToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok-1',
      ...data,
    }))

    const issued = await issueToken('user-1', 'Laptop', ['write'], null)

    expect(issued.id).toBe('tok-1')
    expect(issued.raw.startsWith(MCP_TOKEN_PREFIX)).toBe(true)
    expect(issued.lastFour).toBe(issued.raw.slice(-4))

    const data = mockPrisma.mcpAccessToken.create.mock.calls[0][0].data
    expect(data.userId).toBe('user-1')
    expect(data.name).toBe('Laptop')
    expect(data.scopes).toEqual(['read', 'write'])
    expect(data.tokenHash).toBe(hashToken(issued.raw))
    expect(data.tokenHash).not.toContain(issued.raw)
    expect(JSON.stringify(data)).not.toContain(issued.raw)
    expect(data.grantId).toBeNull()
  })

  it('links the token to an OAuth grant when asked', async () => {
    mockPrisma.mcpAccessToken.create.mockImplementation(async ({ data }) => ({ id: 'tok-2', ...data }))

    await issueToken('user-1', 'Claude', ['read'], null, { grantId: 'grant-1' })

    expect(mockPrisma.mcpAccessToken.create.mock.calls[0][0].data.grantId).toBe('grant-1')
  })
})

describe('verifyToken', () => {
  const validRecord = {
    id: 'tok-1',
    userId: 'user-1',
    scopes: ['read'],
    revokedAt: null,
    expiresAt: null,
  }

  it('rejects missing or unprefixed tokens without touching the database', async () => {
    expect(await verifyToken(undefined, NOW)).toBeNull()
    expect(await verifyToken('', NOW)).toBeNull()
    expect(await verifyToken('Bearer something', NOW)).toBeNull()
    expect(mockPrisma.mcpAccessToken.findUnique).not.toHaveBeenCalled()
  })

  it('looks the token up by its peppered hash and returns the principal', async () => {
    mockPrisma.mcpAccessToken.findUnique.mockResolvedValue(validRecord)

    const principal = await verifyToken('ext_mcp_valid', NOW)

    expect(principal).toEqual({ userId: 'user-1', scopes: ['read'], tokenId: 'tok-1' })
    expect(mockPrisma.mcpAccessToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('ext_mcp_valid', PEPPER) },
    })
    expect(mockPrisma.mcpAccessToken.update).toHaveBeenCalledWith({
      where: { id: 'tok-1' },
      data: { lastUsedAt: NOW },
    })
  })

  it('rejects unknown tokens', async () => {
    mockPrisma.mcpAccessToken.findUnique.mockResolvedValue(null)
    expect(await verifyToken('ext_mcp_unknown', NOW)).toBeNull()
    expect(mockPrisma.mcpAccessToken.update).not.toHaveBeenCalled()
  })

  it('rejects revoked tokens', async () => {
    mockPrisma.mcpAccessToken.findUnique.mockResolvedValue({ ...validRecord, revokedAt: new Date() })
    expect(await verifyToken('ext_mcp_revoked', NOW)).toBeNull()
  })

  it('rejects expired tokens but accepts ones expiring in the future', async () => {
    mockPrisma.mcpAccessToken.findUnique.mockResolvedValue({
      ...validRecord,
      expiresAt: new Date('2026-09-09T11:59:59Z'),
    })
    expect(await verifyToken('ext_mcp_expired', NOW)).toBeNull()

    mockPrisma.mcpAccessToken.findUnique.mockResolvedValue({
      ...validRecord,
      expiresAt: new Date('2026-09-09T12:00:01Z'),
    })
    expect(await verifyToken('ext_mcp_fresh', NOW)).not.toBeNull()
  })

  it('still authenticates when the lastUsedAt bump fails', async () => {
    mockPrisma.mcpAccessToken.findUnique.mockResolvedValue(validRecord)
    mockPrisma.mcpAccessToken.update.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await verifyToken('ext_mcp_valid', NOW)).not.toBeNull()

    spy.mockRestore()
  })

  it('fails closed when the pepper is not configured', async () => {
    delete process.env.MCP_TOKEN_PEPPER
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await verifyToken('ext_mcp_valid', NOW)).toBeNull()
    expect(mockPrisma.mcpAccessToken.findUnique).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})
