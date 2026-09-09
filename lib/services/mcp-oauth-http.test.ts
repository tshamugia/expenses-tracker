import { describe, expect, it, vi } from 'vitest'
import { OAuthRequestError } from './mcp-oauth'
import { jsonNoStore, metadataResponse, oauthErrorResponse, readParams } from './mcp-oauth-http'

describe('readParams', () => {
  it('parses application/x-www-form-urlencoded bodies', async () => {
    const req = new Request('http://x/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=a%20b',
    })
    expect(await readParams(req)).toEqual({ grant_type: 'authorization_code', code: 'a b' })
  })

  it('parses JSON bodies, keeping only string values', async () => {
    const req = new Request('http://x/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', n: 1 }),
    })
    expect(await readParams(req)).toEqual({ grant_type: 'refresh_token' })
  })

  it('rejects malformed JSON as invalid_request', async () => {
    const req = new Request('http://x/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[1]',
    })
    await expect(readParams(req)).rejects.toMatchObject({ code: 'invalid_request' })
  })
})

describe('responses', () => {
  it('metadata is cacheable and CORS-readable; token responses are no-store', async () => {
    const meta = metadataResponse({ a: 1 })
    expect(meta.headers.get('cache-control')).toContain('max-age=3600')
    expect(meta.headers.get('access-control-allow-origin')).toBe('*')
    expect(await meta.json()).toEqual({ a: 1 })

    const tok = jsonNoStore({ b: 2 }, 201)
    expect(tok.status).toBe(201)
    expect(tok.headers.get('cache-control')).toBe('no-store')
    expect(tok.headers.get('pragma')).toBe('no-cache')
  })

  it('maps OAuthRequestError to its status/body and hides unexpected errors', async () => {
    const known = oauthErrorResponse(new OAuthRequestError('invalid_grant', 'nope'), 'token')
    expect(known.status).toBe(400)
    expect(await known.json()).toEqual({ error: 'invalid_grant', error_description: 'nope' })

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unknown = oauthErrorResponse(new Error('db down: secret host'), 'token')
    expect(unknown.status).toBe(500)
    expect(JSON.stringify(await unknown.json())).not.toContain('secret host')
    spy.mockRestore()
  })
})
