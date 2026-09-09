import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExchange, mockRefresh } = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('@/lib/services/mcp-oauth', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/mcp-oauth')>()
  return { ...actual, exchangeAuthorizationCode: mockExchange, refreshAccessToken: mockRefresh }
})

import { OAuthRequestError } from '@/lib/services/mcp-oauth'
import { POST } from './route'

const TOKENS = { access_token: 'ext_mcp_a', token_type: 'Bearer', expires_in: 3600, refresh_token: 'ext_rt_r', scope: 'read' }

function post(body: string, ip = '203.0.113.1') {
  return POST(
    new Request('http://x/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
      body,
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExchange.mockResolvedValue(TOKENS)
  mockRefresh.mockResolvedValue(TOKENS)
})

describe('POST /api/oauth/token', () => {
  it('dispatches authorization_code with the form fields mapped', async () => {
    const res = await post(
      'grant_type=authorization_code&code=C&client_id=ID&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&code_verifier=V&resource=https%3A%2F%2Fx%2Fapi%2Fmcp'
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual(TOKENS)
    expect(mockExchange).toHaveBeenCalledWith({
      code: 'C',
      clientId: 'ID',
      redirectUri: 'https://claude.ai/cb',
      codeVerifier: 'V',
      resource: 'https://x/api/mcp',
    })
  })

  it('dispatches refresh_token', async () => {
    const res = await post('grant_type=refresh_token&refresh_token=R&client_id=ID&scope=read')
    expect(res.status).toBe(200)
    expect(mockRefresh).toHaveBeenCalledWith({ refreshToken: 'R', clientId: 'ID', scope: 'read' })
  })

  it('rejects other grant types with unsupported_grant_type', async () => {
    const res = await post('grant_type=client_credentials')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'unsupported_grant_type' })
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('returns RFC 6749 error bodies from the service', async () => {
    mockExchange.mockRejectedValueOnce(new OAuthRequestError('invalid_grant', 'bad code'))
    const res = await post('grant_type=authorization_code&code=x&client_id=y&code_verifier=z')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant', error_description: 'bad code' })
  })

  it('blocks a client address after repeated failures', async () => {
    mockExchange.mockRejectedValue(new OAuthRequestError('invalid_grant', 'bad'))
    for (let i = 0; i < 20; i++) await post('grant_type=authorization_code&code=x&client_id=y&code_verifier=z', '198.51.100.7')
    const res = await post('grant_type=authorization_code&code=x&client_id=y&code_verifier=z', '198.51.100.7')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    // Another address is unaffected.
    mockExchange.mockResolvedValueOnce(TOKENS)
    expect((await post('grant_type=authorization_code&code=x&client_id=y&code_verifier=z', '198.51.100.8')).status).toBe(200)
  })
})
