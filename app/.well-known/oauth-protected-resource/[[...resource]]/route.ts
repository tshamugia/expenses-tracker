/**
 * RFC 9728 protected resource metadata for the MCP endpoint. Served at both
 * /.well-known/oauth-protected-resource (origin form) and
 * /.well-known/oauth-protected-resource/api/mcp (path-suffixed form, which
 * clients try first for a resource with a path). Both describe /api/mcp.
 */

import { buildProtectedResourceMetadata, resolveIssuer } from '@/lib/services/mcp-oauth'
import { corsPreflight, metadataResponse } from '@/lib/services/mcp-oauth-http'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  return metadataResponse(buildProtectedResourceMetadata(resolveIssuer()))
}

export function OPTIONS(): Response {
  return corsPreflight()
}
