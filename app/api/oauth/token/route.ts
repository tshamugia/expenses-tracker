/**
 * OAuth 2.1 token endpoint: authorization_code (+ PKCE) and refresh_token
 * grants for public clients. Body is application/x-www-form-urlencoded
 * (RFC 6749 §4.1.3); JSON is tolerated. Failed attempts are rate-limited per
 * client address to blunt code/refresh-token guessing.
 */

import { exchangeAuthorizationCode, OAuthRequestError, refreshAccessToken } from '@/lib/services/mcp-oauth'
import { corsPreflight, jsonNoStore, oauthErrorResponse, readParams, NO_STORE_HEADERS } from '@/lib/services/mcp-oauth-http'
import { clientKeyFromRequest, createRateLimiter } from '@/lib/services/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FAILURES_PER_MINUTE = 20
const limiter = createRateLimiter({ windowMs: 60_000, max: FAILURES_PER_MINUTE })

export async function POST(req: Request): Promise<Response> {
  const key = clientKeyFromRequest(req)
  const gate = limiter.isBlocked(key)
  if (gate.blocked) {
    const retryAfter = gate.resetAt ? Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 1000)) : 60
    return jsonNoStore(
      { error: 'invalid_request', error_description: 'Too many failed attempts' },
      429,
      { 'Retry-After': String(retryAfter) }
    )
  }

  try {
    const params = await readParams(req)
    let tokens
    switch (params.grant_type) {
      case 'authorization_code':
        tokens = await exchangeAuthorizationCode({
          code: params.code,
          clientId: params.client_id,
          redirectUri: params.redirect_uri,
          codeVerifier: params.code_verifier,
          resource: params.resource,
        })
        break
      case 'refresh_token':
        tokens = await refreshAccessToken({
          refreshToken: params.refresh_token,
          clientId: params.client_id,
          scope: params.scope,
        })
        break
      default:
        throw new OAuthRequestError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token')
    }
    limiter.clear(key)
    return jsonNoStore(tokens)
  } catch (error) {
    if (error instanceof OAuthRequestError) limiter.recordFailure(key)
    return oauthErrorResponse(error, 'token')
  }
}

export function OPTIONS(): Response {
  return corsPreflight(NO_STORE_HEADERS)
}
