/**
 * MCP (Model Context Protocol) endpoint — Streamable HTTP at /api/mcp.
 *
 * Auth: Bearer personal access token (Settings → MCP access). The token is
 * resolved to a userId before any tool runs; tools never accept a userId.
 * Failed authentications are rate-limited per client address.
 *
 * Client config (Claude Code):
 *   claude mcp add --transport http extracker https://<host>/api/mcp \
 *     --header "Authorization: Bearer ext_mcp_..."
 */

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { verifyToken } from '@/lib/services/mcp-auth'
import { MCP_SERVER_INFO, registerExtrackerTools } from '@/lib/services/mcp-tools'
import { clientKeyFromRequest, createRateLimiter } from '@/lib/services/rate-limit'

// Prisma is not Edge-compatible.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUTH_FAILURES_PER_MINUTE = 20

const limiter = createRateLimiter({ windowMs: 60_000, max: AUTH_FAILURES_PER_MINUTE })

const mcpHandler = createMcpHandler(
  (server) => {
    registerExtrackerTools(server)
  },
  { serverInfo: { ...MCP_SERVER_INFO } }
)

async function verifyBearer(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const principal = await verifyToken(bearerToken)
  if (!principal) return undefined
  return {
    // Never keep the raw secret around — the token id is enough for logs.
    token: principal.tokenId,
    clientId: principal.tokenId,
    scopes: principal.scopes,
    extra: { ...principal },
  }
}

const authHandler = withMcpAuth(mcpHandler, verifyBearer, { required: true })

async function handle(req: Request): Promise<Response> {
  const key = clientKeyFromRequest(req)
  const gate = limiter.isBlocked(key)
  if (gate.blocked) {
    const retryAfter = gate.resetAt ? Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 1000)) : 60
    return new Response(JSON.stringify({ error: 'Too many failed authentication attempts' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    })
  }

  const res = await authHandler(req)
  if (res.status === 401) limiter.recordFailure(key)
  else if (res.status < 400) limiter.clear(key)
  return res
}

export { handle as GET, handle as POST, handle as DELETE }
