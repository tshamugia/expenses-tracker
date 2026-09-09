import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getAuthServer, OPTIONS } from './route'
import { GET as getProtectedResource } from '../oauth-protected-resource/[[...resource]]/route'

beforeEach(() => {
  process.env.AUTH_URL = 'https://app.example.com'
})

describe('/.well-known discovery documents', () => {
  it('authorization server metadata points at the in-app endpoints', async () => {
    const res = getAuthServer()
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toMatchObject({
      issuer: 'https://app.example.com',
      authorization_endpoint: 'https://app.example.com/oauth/authorize',
      token_endpoint: 'https://app.example.com/api/oauth/token',
      registration_endpoint: 'https://app.example.com/api/oauth/register',
      code_challenge_methods_supported: ['S256'],
    })
  })

  it('protected resource metadata names /api/mcp and the issuer', async () => {
    const res = getProtectedResource()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      resource: 'https://app.example.com/api/mcp',
      authorization_servers: ['https://app.example.com'],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
    })
  })

  it('answers CORS preflight', () => {
    expect(OPTIONS().status).toBe(204)
  })
})
