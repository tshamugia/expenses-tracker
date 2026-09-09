/**
 * RFC 7009 token revocation. Always answers 200 for well-formed requests —
 * the RFC forbids revealing whether the token existed.
 */

import { revokeByToken } from '@/lib/services/mcp-oauth'
import { corsPreflight, jsonNoStore, oauthErrorResponse, readParams, NO_STORE_HEADERS } from '@/lib/services/mcp-oauth-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  try {
    const params = await readParams(req)
    if (!params.token) {
      return jsonNoStore({ error: 'invalid_request', error_description: 'token is required' }, 400)
    }
    await revokeByToken(params.token)
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return oauthErrorResponse(error, 'revocation')
  }
}

export function OPTIONS(): Response {
  return corsPreflight(NO_STORE_HEADERS)
}
