'use server'

/**
 * Server Actions for MCP personal access tokens (Settings → MCP access).
 * BUSINESS LOGIC LAYER — auth → validate → mcp-auth service → revalidate.
 * The raw token is returned exactly once from createMcpToken.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { issueToken, normalizeScopes } from '@/lib/services/mcp-auth'
import type { ActionResult } from '@/types/settings-types'
import type {
  CreateMcpTokenInput,
  CreatedMcpToken,
  McpTokenListItem,
} from '@/types/mcp-types'

const MAX_NAME_LENGTH = 60
const MAX_ACTIVE_TOKENS = 10
const MAX_EXPIRY_DAYS = 365 * 5
const DAY_MS = 24 * 60 * 60 * 1000

const listSelect = {
  id: true,
  name: true,
  lastFour: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
} as const

/** Active (not revoked) tokens of the current user, newest first. */
export async function listMcpTokens(): Promise<ActionResult<McpTokenListItem[]>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const tokens = await prisma.mcpAccessToken.findMany({
      where: { userId: session.user.id, revokedAt: null },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    })
    return { success: true, data: tokens }
  } catch (error) {
    console.error('Error in listMcpTokens:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load tokens' }
  }
}

/** Create a token; the raw secret in the result is shown to the user once. */
export async function createMcpToken(input: CreateMcpTokenInput): Promise<ActionResult<CreatedMcpToken>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id

    const name = input.name?.trim() ?? ''
    if (!name) return { success: false, error: 'Token name is required' }
    if (name.length > MAX_NAME_LENGTH) {
      return { success: false, error: `Token name must be at most ${MAX_NAME_LENGTH} characters` }
    }

    let expiresAt: Date | null = null
    if (input.expiresInDays !== undefined && input.expiresInDays !== null) {
      const days = input.expiresInDays
      if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
        return { success: false, error: `Expiry must be between 1 and ${MAX_EXPIRY_DAYS} days` }
      }
      expiresAt = new Date(Date.now() + days * DAY_MS)
    }

    const activeCount = await prisma.mcpAccessToken.count({ where: { userId, revokedAt: null } })
    if (activeCount >= MAX_ACTIVE_TOKENS) {
      return { success: false, error: `You can have at most ${MAX_ACTIVE_TOKENS} active tokens` }
    }

    const issued = await issueToken(userId, name, normalizeScopes(input.scopes ?? []), expiresAt)
    const item = await prisma.mcpAccessToken.findUniqueOrThrow({
      where: { id: issued.id },
      select: listSelect,
    })

    revalidatePath('/settings')
    return { success: true, data: { token: issued.raw, item } }
  } catch (error) {
    console.error('Error in createMcpToken:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create token' }
  }
}

/** Revoke one of the current user's tokens (idempotent; foreign ids are rejected). */
export async function revokeMcpToken(id: string): Promise<ActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const token = await prisma.mcpAccessToken.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, revokedAt: true },
    })
    if (!token) return { success: false, error: 'Token not found or access denied' }

    if (!token.revokedAt) {
      await prisma.mcpAccessToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } })
    }

    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error in revokeMcpToken:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to revoke token' }
  }
}
