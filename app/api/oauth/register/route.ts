/**
 * RFC 7591 dynamic client registration (public clients only).
 * Claude.ai registers a fresh client for every new connection, so the
 * endpoint is open but rate-limited per client address.
 */

import { registerClient } from '@/lib/services/mcp-oauth'
import { corsPreflight, jsonNoStore, oauthErrorResponse, NO_STORE_HEADERS } from '@/lib/services/mcp-oauth-http'
import { clientKeyFromRequest } from '@/lib/services/rate-limit'
import { checkRateLimit } from '@/lib/utils/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT = { limit: 10, windowMs: 60_000 } // registrations per minute per address

export async function POST(req: Request): Promise<Response> {
  const rate = checkRateLimit(`oauth-register:${clientKeyFromRequest(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs)
  if (!rate.allowed) {
    return jsonNoStore(
      { error: 'invalid_request', error_description: 'Too many registrations' },
      429,
      { 'Retry-After': String(rate.retryAfter) }
    )
  }

  try {
    const body: unknown = await req.json().catch(() => null)
    const client = await registerClient(body)
    return jsonNoStore(client, 201)
  } catch (error) {
    return oauthErrorResponse(error, 'registration')
  }
}

export function OPTIONS(): Response {
  return corsPreflight(NO_STORE_HEADERS)
}
