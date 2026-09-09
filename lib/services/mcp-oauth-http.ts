/**
 * Small HTTP helpers shared by the OAuth route handlers (app/api/oauth/*,
 * app/.well-known/*). Keeps the handlers to: parse → service → respond.
 */

import { OAuthRequestError } from '@/lib/services/mcp-oauth'

/** Metadata documents are public and cacheable; CORS lets browser MCP clients read them. */
export const METADATA_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
} as const

/** Token-ish responses must never be cached (RFC 6749 §5.1). */
export const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
} as const

export function metadataResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: METADATA_HEADERS })
}

export function corsPreflight(headers: Record<string, string> = METADATA_HEADERS): Response {
  return new Response(null, { status: 204, headers })
}

export function jsonNoStore(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE_HEADERS, ...extra } })
}

/** Map any thrown error to an RFC 6749 error body; unexpected errors are logged, not leaked. */
export function oauthErrorResponse(error: unknown, context: string): Response {
  if (error instanceof OAuthRequestError) return jsonNoStore(error.toJSON(), error.status)
  console.error(`OAuth ${context} failed:`, error)
  return jsonNoStore({ error: 'server_error', error_description: 'Unexpected error' }, 500)
}

/**
 * Read a request body as key/value pairs. Accepts
 * application/x-www-form-urlencoded (what OAuth clients send) and JSON.
 */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? ''
  const out: Record<string, string> = {}
  if (contentType.includes('application/json')) {
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new OAuthRequestError('invalid_request', 'Malformed JSON body')
    }
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  }
  const text = await req.text()
  for (const [k, v] of new URLSearchParams(text)) out[k] = v
  return out
}
