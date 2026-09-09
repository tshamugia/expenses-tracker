/**
 * RFC 8414 authorization server metadata. Claude (and any MCP client)
 * reads this to find /oauth/authorize, /api/oauth/token and /api/oauth/register.
 */

import { buildAuthorizationServerMetadata, resolveIssuer } from '@/lib/services/mcp-oauth'
import { corsPreflight, metadataResponse } from '@/lib/services/mcp-oauth-http'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  return metadataResponse(buildAuthorizationServerMetadata(resolveIssuer()))
}

export function OPTIONS(): Response {
  return corsPreflight()
}
