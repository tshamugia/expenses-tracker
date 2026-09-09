import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }))

vi.mock('@/lib/services/mcp-oauth', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/mcp-oauth')>()
  return { ...actual, registerClient: mockRegister }
})

import { OAuthRequestError } from '@/lib/services/mcp-oauth'
import { OPTIONS, POST } from './route'

function post(body: string, ip = '203.0.113.9') {
  return POST(
    new Request('http://x/api/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body,
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRegister.mockResolvedValue({ client_id: 'id-1', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] })
})

describe('POST /api/oauth/register', () => {
  it('returns 201 with the registered client', async () => {
    const res = await post(JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }))
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ client_id: 'id-1' })
    expect(mockRegister).toHaveBeenCalledWith({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] })
  })

  it('passes malformed JSON to the validator (which rejects it) instead of crashing', async () => {
    mockRegister.mockRejectedValueOnce(new OAuthRequestError('invalid_client_metadata', 'Invalid metadata'))
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(mockRegister).toHaveBeenCalledWith(null)
    expect(await res.json()).toMatchObject({ error: 'invalid_client_metadata' })
  })

  it('rate-limits registrations per client address', async () => {
    for (let i = 0; i < 10; i++) expect((await post('{}', '198.51.100.20')).status).toBe(201)
    const res = await post('{}', '198.51.100.20')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('answers CORS preflight', () => {
    const res = OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
