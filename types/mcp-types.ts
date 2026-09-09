/**
 * MCP (Model Context Protocol) server types — personal access tokens that
 * headless AI clients (Claude Desktop, Claude Code, Cursor, …) use to reach
 * the user's data through app/api/mcp.
 */

export const MCP_SCOPES = ['read', 'write'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

/** Resolved identity behind a valid Bearer token. Never derived from tool input. */
export interface McpPrincipal {
  userId: string
  scopes: string[]
  tokenId: string
}

/** What the Settings UI shows for each token (never the raw secret). */
export interface McpTokenListItem {
  id: string
  name: string
  lastFour: string
  scopes: string[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export interface CreateMcpTokenInput {
  name: string
  scopes: McpScope[]
  /** Days until expiry; omitted/null = never expires. */
  expiresInDays?: number | null
}

/** Returned once at creation — `token` is the only time the raw secret is visible. */
export interface CreatedMcpToken {
  token: string
  item: McpTokenListItem
}
