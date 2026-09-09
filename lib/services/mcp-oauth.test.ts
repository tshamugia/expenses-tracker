import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    mcpOAuthClient: { create: vi.fn(), findUnique: vi.fn() },
    mcpOAuthAuthorizationCode: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    mcpOAuthGrant: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    mcpAccessToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ default: mockPrisma }))

// Hashes are computed at collection time in some describe blocks.
process.env.MCP_TOKEN_PEPPER = 'unit-test-pepper'

import { hashToken, MCP_TOKEN_PREFIX } from './mcp-auth'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_MS,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  buildRedirectUrl,
  computeCodeChallenge,
  exchangeAuthorizationCode,
  isAcceptableRedirectUri,
  isRedirectUriAllowed,
  issueAuthorizationCode,
  OAuthRequestError,
  parseScopeParam,
  refreshAccessToken,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  registerClient,
  resolveIssuer,
  resolveMcpResourceUrl,
  revokeByToken,
  revokeGrant,
  validateAuthorizationRequest,
  verifyCodeVerifier,
} from './mcp-oauth'

const NOW = new Date('2026-09-09T12:00:00Z')
const ISSUER = 'https://app.example.com'
const RESOURCE = `${ISSUER}/api/mcp`
const CLIENT_ID = '11111111-2222-4333-8444-555555555555'
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'v'.repeat(43)
const CHALLENGE = computeCodeChallenge(VERIFIER)

const client = { id: CLIENT_ID, name: 'Claude', redirectUris: [CLAUDE_CALLBACK, 'http://localhost/callback'] }

function validParams(overrides: Record<string, string | undefined> = {}) {
  return {
    client_id: CLIENT_ID,
    redirect_uri: CLAUDE_CALLBACK,
    response_type: 'code',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    scope: 'read write',
    state: 'xyz',
    resource: RESOURCE,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MCP_TOKEN_PEPPER = 'unit-test-pepper'
  process.env.AUTH_URL = ISSUER
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops))
  mockPrisma.mcpOAuthClient.findUnique.mockResolvedValue(client)
  mockPrisma.mcpOAuthGrant.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.mcpAccessToken.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.mcpAccessToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'tok-1',
    lastFour: 'abcd',
    ...data,
  }))
})

describe('issuer + metadata', () => {
  it('derives the issuer from AUTH_URL/NEXTAUTH_URL without a trailing slash', () => {
    expect(resolveIssuer({ AUTH_URL: 'https://x.io/' })).toBe('https://x.io')
    expect(resolveIssuer({ NEXTAUTH_URL: 'https://y.io' })).toBe('https://y.io')
    expect(resolveIssuer({})).toBe('http://localhost:3000')
    expect(resolveMcpResourceUrl({ AUTH_URL: 'https://x.io' })).toBe('https://x.io/api/mcp')
  })

  it('advertises what Claude requires: PKCE S256, DCR, public clients, refresh tokens', () => {
    const meta = buildAuthorizationServerMetadata(ISSUER)
    expect(meta).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      registration_endpoint: `${ISSUER}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      scopes_supported: ['read', 'write'],
    })
  })

  it('protected resource metadata names /api/mcp and this issuer', () => {
    expect(buildProtectedResourceMetadata(ISSUER)).toEqual({
      resource: RESOURCE,
      authorization_servers: [ISSUER],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
    })
  })
})

describe('redirect URIs', () => {
  it('accepts https and loopback http only, never fragments', () => {
    expect(isAcceptableRedirectUri(CLAUDE_CALLBACK)).toBe(true)
    expect(isAcceptableRedirectUri('http://localhost:3118/callback')).toBe(true)
    expect(isAcceptableRedirectUri('http://127.0.0.1/cb')).toBe(true)
    expect(isAcceptableRedirectUri('http://[::1]/cb')).toBe(true)
    expect(isAcceptableRedirectUri('http://evil.com/cb')).toBe(false)
    expect(isAcceptableRedirectUri('https://x.io/cb#frag')).toBe(false)
    expect(isAcceptableRedirectUri('not a url')).toBe(false)
    expect(isAcceptableRedirectUri('javascript:alert(1)')).toBe(false)
  })

  it('matches exactly, except loopback where the port is ignored (RFC 8252)', () => {
    const registered = [CLAUDE_CALLBACK, 'http://localhost/callback']
    expect(isRedirectUriAllowed(registered, CLAUDE_CALLBACK)).toBe(true)
    expect(isRedirectUriAllowed(registered, 'https://claude.ai/api/mcp/auth_callback/../x')).toBe(false)
    expect(isRedirectUriAllowed(registered, 'https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false)
    expect(isRedirectUriAllowed(registered, 'http://localhost:3118/callback')).toBe(true)
    expect(isRedirectUriAllowed(registered, 'http://localhost:3118/other')).toBe(false)
    expect(isRedirectUriAllowed(registered, 'http://127.0.0.1:3118/callback')).toBe(false)
    expect(isRedirectUriAllowed(['https://x.io:1/cb'], 'https://x.io:2/cb')).toBe(false)
  })

  it('buildRedirectUrl keeps the existing query and skips undefined params', () => {
    expect(buildRedirectUrl('https://x.io/cb?keep=1', { code: 'c', state: undefined })).toBe(
      'https://x.io/cb?keep=1&code=c'
    )
  })
})

describe('scopes + PKCE', () => {
  it('parses scope strings, defaults to all, rejects unknown scopes', () => {
    expect(parseScopeParam(undefined)).toEqual(['read', 'write'])
    expect(parseScopeParam('write')).toEqual(['read', 'write'])
    expect(parseScopeParam('read')).toEqual(['read'])
    expect(() => parseScopeParam('read admin')).toThrow(OAuthRequestError)
  })

  it('verifies S256 verifiers and rejects malformed ones', () => {
    expect(verifyCodeVerifier(VERIFIER, CHALLENGE)).toBe(true)
    expect(verifyCodeVerifier('w'.repeat(43), CHALLENGE)).toBe(false)
    expect(verifyCodeVerifier('short', CHALLENGE)).toBe(false)
    expect(verifyCodeVerifier(undefined, CHALLENGE)).toBe(false)
  })
})

describe('registerClient (RFC 7591)', () => {
  beforeEach(() => {
    mockPrisma.mcpOAuthClient.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: CLIENT_ID,
      createdAt: NOW,
      ...data,
    }))
  })

  it('registers a public client and echoes RFC 7591 fields', async () => {
    const result = await registerClient({
      client_name: 'Claude',
      redirect_uris: [CLAUDE_CALLBACK, CLAUDE_CALLBACK],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })
    expect(result).toEqual({
      client_id: CLIENT_ID,
      client_id_issued_at: Math.floor(NOW.getTime() / 1000),
      client_name: 'Claude',
      redirect_uris: [CLAUDE_CALLBACK],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })
    expect(mockPrisma.mcpOAuthClient.create).toHaveBeenCalledWith({
      data: { name: 'Claude', redirectUris: [CLAUDE_CALLBACK] },
    })
  })

  it('defaults the name and grant/response types when omitted', async () => {
    const result = await registerClient({ redirect_uris: [CLAUDE_CALLBACK] })
    expect(result.client_name).toBe('MCP client')
    expect(result.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(result.response_types).toEqual(['code'])
  })

  it.each([
    [{}, 'invalid_client_metadata'],
    [{ redirect_uris: [] }, 'invalid_client_metadata'],
    [{ redirect_uris: ['http://evil.com/cb'] }, 'invalid_redirect_uri'],
    [{ redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'client_secret_basic' }, 'invalid_client_metadata'],
    [{ redirect_uris: [CLAUDE_CALLBACK], grant_types: ['client_credentials'] }, 'invalid_client_metadata'],
    [{ redirect_uris: [CLAUDE_CALLBACK], response_types: ['token'] }, 'invalid_client_metadata'],
    ['not an object', 'invalid_client_metadata'],
  ])('rejects %j with %s', async (body, code) => {
    await expect(registerClient(body)).rejects.toMatchObject({ code })
    expect(mockPrisma.mcpOAuthClient.create).not.toHaveBeenCalled()
  })
})

describe('validateAuthorizationRequest', () => {
  it('accepts a well-formed request', async () => {
    const result = await validateAuthorizationRequest(validParams(), RESOURCE)
    expect(result).toEqual({
      ok: true,
      request: {
        client: { id: CLIENT_ID, name: 'Claude' },
        redirectUri: CLAUDE_CALLBACK,
        scopes: ['read', 'write'],
        codeChallenge: CHALLENGE,
        state: 'xyz',
        resource: RESOURCE,
      },
    })
  })

  it('uses the first value of repeated parameters', async () => {
    const result = await validateAuthorizationRequest({ ...validParams(), scope: ['read', 'write'] }, RESOURCE)
    expect(result.ok && result.request.scopes).toEqual(['read'])
  })

  it('NEVER redirects for an unknown client or unregistered redirect_uri', async () => {
    mockPrisma.mcpOAuthClient.findUnique.mockResolvedValueOnce(null)
    const unknown = await validateAuthorizationRequest(validParams(), RESOURCE)
    expect(unknown).toMatchObject({ ok: false, failure: { kind: 'display', error: { code: 'invalid_client' } } })

    const badUri = await validateAuthorizationRequest(validParams({ redirect_uri: 'https://evil.com/cb' }), RESOURCE)
    expect(badUri).toMatchObject({ ok: false, failure: { kind: 'display', error: { code: 'invalid_request' } } })

    const notUuid = await validateAuthorizationRequest(validParams({ client_id: 'x' }), RESOURCE)
    expect(notUuid).toMatchObject({ ok: false, failure: { kind: 'display' } })
    expect(mockPrisma.mcpOAuthClient.findUnique).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ response_type: 'token' }, 'unsupported_response_type'],
    [{ code_challenge: undefined }, 'invalid_request'],
    [{ code_challenge: 'too-short' }, 'invalid_request'],
    [{ code_challenge_method: 'plain' }, 'invalid_request'],
    [{ scope: 'admin' }, 'invalid_scope'],
    [{ resource: 'https://other.example.com/mcp' }, 'invalid_target'],
  ])('redirects back with %j → %s (state preserved)', async (overrides, code) => {
    const result = await validateAuthorizationRequest(validParams(overrides), RESOURCE)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.kind).toBe('redirect')
    if (result.failure.kind !== 'redirect') return
    const url = new URL(result.failure.redirectTo)
    expect(url.origin + url.pathname).toBe(CLAUDE_CALLBACK)
    expect(url.searchParams.get('error')).toBe(code)
    expect(url.searchParams.get('state')).toBe('xyz')
  })

  it('treats a missing resource parameter as acceptable', async () => {
    const result = await validateAuthorizationRequest(validParams({ resource: undefined }), RESOURCE)
    expect(result.ok).toBe(true)
  })
})

describe('issueAuthorizationCode', () => {
  it('stores only a hash, binds client/redirect/PKCE, and redirects with code + state', async () => {
    mockPrisma.mcpOAuthAuthorizationCode.create.mockResolvedValue({})
    const validated = await validateAuthorizationRequest(validParams(), RESOURCE)
    if (!validated.ok) throw new Error('unexpected')

    const redirectTo = await issueAuthorizationCode(validated.request, 'user-1', ['read'], NOW)
    const url = new URL(redirectTo)
    const code = url.searchParams.get('code')!
    expect(code.length).toBeGreaterThanOrEqual(43)
    expect(url.searchParams.get('state')).toBe('xyz')

    const { data } = mockPrisma.mcpOAuthAuthorizationCode.create.mock.calls[0][0]
    expect(data).toEqual({
      codeHash: hashToken(code),
      clientId: CLIENT_ID,
      userId: 'user-1',
      redirectUri: CLAUDE_CALLBACK,
      scopes: ['read'], // user withheld write
      codeChallenge: CHALLENGE,
      resource: RESOURCE,
      expiresAt: new Date(NOW.getTime() + AUTHORIZATION_CODE_TTL_MS),
    })
    expect(JSON.stringify(data)).not.toContain(code)
  })

  it('never grants a scope the client did not request', async () => {
    mockPrisma.mcpOAuthAuthorizationCode.create.mockResolvedValue({})
    const validated = await validateAuthorizationRequest(validParams({ scope: 'read' }), RESOURCE)
    if (!validated.ok) throw new Error('unexpected')
    await issueAuthorizationCode(validated.request, 'user-1', ['read', 'write'], NOW)
    expect(mockPrisma.mcpOAuthAuthorizationCode.create.mock.calls[0][0].data.scopes).toEqual(['read'])
  })
})

describe('exchangeAuthorizationCode', () => {
  const CODE = 'authcode-raw'
  const codeRecord = {
    id: 'code-1',
    codeHash: 'ignored',
    clientId: CLIENT_ID,
    userId: 'user-1',
    redirectUri: CLAUDE_CALLBACK,
    scopes: ['read', 'write'],
    codeChallenge: CHALLENGE,
    resource: RESOURCE,
    expiresAt: new Date(NOW.getTime() + 60_000),
    usedAt: null,
  }
  const grantRow = {
    id: 'grant-1',
    clientId: CLIENT_ID,
    userId: 'user-1',
    scopes: ['read', 'write'],
    client: { name: 'Claude' },
  }
  const input = { code: CODE, clientId: CLIENT_ID, redirectUri: CLAUDE_CALLBACK, codeVerifier: VERIFIER, resource: RESOURCE }

  beforeEach(() => {
    mockPrisma.mcpOAuthAuthorizationCode.findUnique.mockResolvedValue(codeRecord)
    mockPrisma.mcpOAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.mcpOAuthGrant.create.mockResolvedValue(grantRow)
  })

  it('redeems a valid code: marks it used, creates a grant, returns tokens', async () => {
    const tokens = await exchangeAuthorizationCode(input, NOW, RESOURCE)

    expect(mockPrisma.mcpOAuthAuthorizationCode.findUnique).toHaveBeenCalledWith({ where: { codeHash: hashToken(CODE) } })
    expect(mockPrisma.mcpOAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'code-1', usedAt: null },
      data: { usedAt: NOW },
    })
    expect(tokens.token_type).toBe('Bearer')
    expect(tokens.expires_in).toBe(ACCESS_TOKEN_TTL_SECONDS)
    expect(tokens.scope).toBe('read write')
    expect(tokens.access_token.startsWith(MCP_TOKEN_PREFIX)).toBe(true)
    expect(tokens.refresh_token.startsWith(REFRESH_TOKEN_PREFIX)).toBe(true)

    const grantData = mockPrisma.mcpOAuthGrant.create.mock.calls[0][0].data
    expect(grantData).toMatchObject({
      clientId: CLIENT_ID,
      userId: 'user-1',
      scopes: ['read', 'write'],
      refreshTokenHash: hashToken(tokens.refresh_token),
      refreshExpiresAt: new Date(NOW.getTime() + REFRESH_TOKEN_TTL_MS),
    })
    const accessData = mockPrisma.mcpAccessToken.create.mock.calls[0][0].data
    expect(accessData).toMatchObject({
      userId: 'user-1',
      name: 'Claude',
      grantId: 'grant-1',
      scopes: ['read', 'write'],
      tokenHash: hashToken(tokens.access_token),
      expiresAt: new Date(NOW.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    })
  })

  it.each([
    ['missing verifier', { ...input, codeVerifier: undefined }, 'invalid_request'],
    ['wrong resource', { ...input, resource: 'https://other/mcp' }, 'invalid_target'],
    ['wrong client', { ...input, clientId: '99999999-2222-4333-8444-555555555555' }, 'invalid_grant'],
    ['wrong redirect_uri', { ...input, redirectUri: 'http://localhost/callback' }, 'invalid_grant'],
    ['wrong verifier', { ...input, codeVerifier: 'w'.repeat(43) }, 'invalid_grant'],
  ])('rejects %s with %s and issues nothing', async (_label, bad, code) => {
    await expect(exchangeAuthorizationCode(bad, NOW, RESOURCE)).rejects.toMatchObject({ code })
    expect(mockPrisma.mcpOAuthGrant.create).not.toHaveBeenCalled()
    expect(mockPrisma.mcpAccessToken.create).not.toHaveBeenCalled()
  })

  it('rejects unknown, expired and already-used codes', async () => {
    mockPrisma.mcpOAuthAuthorizationCode.findUnique.mockResolvedValueOnce(null)
    await expect(exchangeAuthorizationCode(input, NOW, RESOURCE)).rejects.toMatchObject({ code: 'invalid_grant' })

    mockPrisma.mcpOAuthAuthorizationCode.findUnique.mockResolvedValueOnce({ ...codeRecord, expiresAt: NOW })
    await expect(exchangeAuthorizationCode(input, NOW, RESOURCE)).rejects.toMatchObject({ code: 'invalid_grant' })

    mockPrisma.mcpOAuthAuthorizationCode.findUnique.mockResolvedValueOnce({ ...codeRecord, usedAt: NOW })
    await expect(exchangeAuthorizationCode(input, NOW, RESOURCE)).rejects.toMatchObject({ code: 'invalid_grant' })
    expect(mockPrisma.mcpOAuthGrant.create).not.toHaveBeenCalled()
  })

  it('loses the race when a concurrent redemption claimed the code first', async () => {
    mockPrisma.mcpOAuthAuthorizationCode.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(exchangeAuthorizationCode(input, NOW, RESOURCE)).rejects.toMatchObject({ code: 'invalid_grant' })
    expect(mockPrisma.mcpOAuthGrant.create).not.toHaveBeenCalled()
  })
})

describe('refreshAccessToken', () => {
  const OLD = `${REFRESH_TOKEN_PREFIX}old-token`
  const grant = {
    id: 'grant-1',
    clientId: CLIENT_ID,
    userId: 'user-1',
    scopes: ['read', 'write'],
    refreshTokenHash: hashToken(OLD),
    refreshExpiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    client: { name: 'Claude' },
  }

  beforeEach(() => {
    mockPrisma.mcpOAuthGrant.findUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
      where.refreshTokenHash === hashToken(OLD) ? grant : null
    )
    mockPrisma.mcpOAuthGrant.update.mockResolvedValue({})
  })

  it('rotates the refresh token, revokes old access tokens, mints a new one', async () => {
    const tokens = await refreshAccessToken({ refreshToken: OLD, clientId: CLIENT_ID }, NOW)

    expect(tokens.refresh_token).not.toBe(OLD)
    expect(tokens.refresh_token.startsWith(REFRESH_TOKEN_PREFIX)).toBe(true)
    expect(mockPrisma.mcpOAuthGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-1' },
      data: {
        refreshTokenHash: hashToken(tokens.refresh_token),
        previousRefreshTokenHash: hashToken(OLD),
        refreshExpiresAt: new Date(NOW.getTime() + REFRESH_TOKEN_TTL_MS),
        lastUsedAt: NOW,
      },
    })
    expect(mockPrisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: { grantId: 'grant-1', revokedAt: null },
      data: { revokedAt: NOW },
    })
    expect(mockPrisma.mcpAccessToken.create.mock.calls[0][0].data).toMatchObject({ grantId: 'grant-1', scopes: ['read', 'write'] })
    expect(tokens.scope).toBe('read write')
  })

  it('allows down-scoping but never widening', async () => {
    const narrowed = await refreshAccessToken({ refreshToken: OLD, clientId: CLIENT_ID, scope: 'read' }, NOW)
    expect(narrowed.scope).toBe('read')

    mockPrisma.mcpOAuthGrant.findUnique.mockResolvedValueOnce({ ...grant, scopes: ['read'] })
    await expect(
      refreshAccessToken({ refreshToken: OLD, clientId: CLIENT_ID, scope: 'read write' }, NOW)
    ).rejects.toMatchObject({ code: 'invalid_scope' })
  })

  it('replaying a rotated-out refresh token revokes the whole grant (reuse detection)', async () => {
    const STALE = `${REFRESH_TOKEN_PREFIX}stale`
    mockPrisma.mcpOAuthGrant.findUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
      where.previousRefreshTokenHash === hashToken(STALE) ? { id: 'grant-1' } : null
    )
    await expect(refreshAccessToken({ refreshToken: STALE, clientId: CLIENT_ID }, NOW)).rejects.toMatchObject({
      code: 'invalid_grant',
    })
    expect(mockPrisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { id: 'grant-1', revokedAt: null },
      data: { revokedAt: NOW },
    })
    expect(mockPrisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: { grantId: 'grant-1', revokedAt: null },
      data: { revokedAt: NOW },
    })
  })

  it.each([
    ['unknown token', { refreshToken: `${REFRESH_TOKEN_PREFIX}nope`, clientId: CLIENT_ID }, 'invalid_grant'],
    ['access token presented as refresh token', { refreshToken: 'ext_mcp_abc', clientId: CLIENT_ID }, 'invalid_request'],
    ['missing client_id', { refreshToken: OLD }, 'invalid_request'],
    ['wrong client', { refreshToken: OLD, clientId: '99999999-2222-4333-8444-555555555555' }, 'invalid_grant'],
  ])('rejects %s with %s', async (_label, bad, code) => {
    await expect(refreshAccessToken(bad, NOW)).rejects.toMatchObject({ code })
    expect(mockPrisma.mcpAccessToken.create).not.toHaveBeenCalled()
  })

  it('rejects revoked and expired grants with invalid_grant', async () => {
    mockPrisma.mcpOAuthGrant.findUnique.mockResolvedValueOnce({ ...grant, revokedAt: NOW })
    await expect(refreshAccessToken({ refreshToken: OLD, clientId: CLIENT_ID }, NOW)).rejects.toMatchObject({ code: 'invalid_grant' })
    mockPrisma.mcpOAuthGrant.findUnique.mockResolvedValueOnce({ ...grant, refreshExpiresAt: NOW })
    await expect(refreshAccessToken({ refreshToken: OLD, clientId: CLIENT_ID }, NOW)).rejects.toMatchObject({ code: 'invalid_grant' })
  })
})

describe('revocation', () => {
  it('revokeGrant revokes the grant and its access tokens in one transaction', async () => {
    await revokeGrant('grant-1', NOW)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith({ where: { id: 'grant-1', revokedAt: null }, data: { revokedAt: NOW } })
    expect(mockPrisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({ where: { grantId: 'grant-1', revokedAt: null }, data: { revokedAt: NOW } })
  })

  it('revokeByToken handles refresh tokens, OAuth access tokens, PATs and unknown tokens', async () => {
    const RT = `${REFRESH_TOKEN_PREFIX}x`
    mockPrisma.mcpOAuthGrant.findUnique.mockResolvedValueOnce({ id: 'grant-1' })
    await revokeByToken(RT, NOW)
    expect(mockPrisma.mcpOAuthGrant.findUnique).toHaveBeenCalledWith({ where: { refreshTokenHash: hashToken(RT) }, select: { id: true } })
    expect(mockPrisma.mcpOAuthGrant.updateMany).toHaveBeenCalledTimes(1)

    mockPrisma.mcpAccessToken.findUnique.mockResolvedValueOnce({ id: 'tok-oauth', grantId: 'grant-2' })
    await revokeByToken('ext_mcp_oauth', NOW)
    expect(mockPrisma.mcpOAuthGrant.updateMany).toHaveBeenLastCalledWith({ where: { id: 'grant-2', revokedAt: null }, data: { revokedAt: NOW } })

    mockPrisma.mcpAccessToken.findUnique.mockResolvedValueOnce({ id: 'tok-pat', grantId: null })
    await revokeByToken('ext_mcp_pat', NOW)
    expect(mockPrisma.mcpAccessToken.updateMany).toHaveBeenLastCalledWith({ where: { id: 'tok-pat', revokedAt: null }, data: { revokedAt: NOW } })

    mockPrisma.mcpAccessToken.findUnique.mockResolvedValueOnce(null)
    await expect(revokeByToken('ext_mcp_unknown', NOW)).resolves.toBeUndefined()
    await expect(revokeByToken(undefined, NOW)).resolves.toBeUndefined()
  })
})
