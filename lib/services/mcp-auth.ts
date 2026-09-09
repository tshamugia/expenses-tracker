/**
 * MCP personal-access-token issue + verify layer.
 * Tokens are stored as sha256(pepper + raw) only; the raw token is returned
 * exactly once from issueToken. The pepper (MCP_TOKEN_PEPPER) is a server-side
 * secret so a database leak alone cannot be brute-forced against a wordlist.
 */

import { createHash, randomBytes } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { MCP_SCOPES, type McpPrincipal, type McpScope } from '@/types/mcp-types'

export const MCP_TOKEN_PREFIX = 'ext_mcp_'

/** Bytes of entropy per token (256 bits). */
const TOKEN_BYTES = 32

/** sha256(pepper + raw) as hex. Deterministic → uniquely lookupable. */
export function hashToken(raw: string, pepper: string | undefined = process.env.MCP_TOKEN_PEPPER): string {
  if (!pepper) throw new Error('MCP_TOKEN_PEPPER is not set')
  return createHash('sha256').update(pepper + raw).digest('hex')
}

/** A fresh raw token: prefix + 43 base64url characters. */
export function generateRawToken(): string {
  return MCP_TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url')
}

export function isMcpScope(value: string): value is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(value)
}

/** Normalize a scope list: known scopes only, deduplicated, `read` always present. */
export function normalizeScopes(scopes: readonly string[]): McpScope[] {
  const set = new Set<McpScope>(['read'])
  for (const s of scopes) if (isMcpScope(s)) set.add(s)
  return MCP_SCOPES.filter((s) => set.has(s))
}

export interface IssuedToken {
  /** Show to the user once; never stored. */
  raw: string
  id: string
  lastFour: string
}

/** Generate + persist a new PAT for `userId`. Returns the raw token ONCE. */
export async function issueToken(
  userId: string,
  name: string,
  scopes: readonly string[] = ['read'],
  expiresAt: Date | null = null
): Promise<IssuedToken> {
  const raw = generateRawToken()
  const record = await prisma.mcpAccessToken.create({
    data: {
      userId,
      name,
      tokenHash: hashToken(raw),
      lastFour: raw.slice(-4),
      scopes: normalizeScopes(scopes),
      expiresAt,
    },
  })
  return { raw, id: record.id, lastFour: record.lastFour }
}

/**
 * Resolve a Bearer token → principal, or null when the token is missing,
 * malformed, unknown, revoked or expired. Bumps lastUsedAt on success.
 */
export async function verifyToken(
  raw: string | undefined | null,
  now: Date = new Date()
): Promise<McpPrincipal | null> {
  if (!raw || !raw.startsWith(MCP_TOKEN_PREFIX)) return null

  let tokenHash: string
  try {
    tokenHash = hashToken(raw)
  } catch (error) {
    console.error('MCP auth misconfigured:', error)
    return null
  }

  const token = await prisma.mcpAccessToken.findUnique({ where: { tokenHash } })
  if (!token || token.revokedAt) return null
  if (token.expiresAt && token.expiresAt.getTime() <= now.getTime()) return null

  // Audit trail; a failure here must never reject a valid request.
  try {
    await prisma.mcpAccessToken.update({
      where: { id: token.id },
      data: { lastUsedAt: now },
    })
  } catch (error) {
    console.error('Failed to bump MCP token lastUsedAt:', error)
  }

  return { userId: token.userId, scopes: token.scopes, tokenId: token.id }
}
