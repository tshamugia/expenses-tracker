'use server'

/**
 * Server Actions for the OAuth consent screen (/oauth/authorize) and the
 * "Connected apps" list in Settings. BUSINESS LOGIC LAYER — auth → re-validate
 * the authorization request from its raw parameters (never from client state)
 * → mcp-oauth service → revalidate.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import {
  buildRedirectUrl,
  issueAuthorizationCode,
  revokeGrant,
  validateAuthorizationRequest,
  type AuthorizeParams,
} from '@/lib/services/mcp-oauth'
import type { ActionResult } from '@/types/settings-types'
import type { ConnectedAppItem, McpScope } from '@/types/mcp-types'

export interface ConsentDecision {
  /** Grant the `write` scope if the client asked for it. `read` is always granted. */
  allowWrite: boolean
}

export interface ConsentRedirect {
  redirectTo: string
}

/** User approved: mint a single-use authorization code and send them back to the client. */
export async function approveAuthorization(
  params: AuthorizeParams,
  decision: ConsentDecision
): Promise<ActionResult<ConsentRedirect>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const validated = await validateAuthorizationRequest(params)
    if (!validated.ok) {
      const { failure } = validated
      if (failure.kind === 'redirect') return { success: true, data: { redirectTo: failure.redirectTo } }
      return { success: false, error: failure.error.message }
    }

    const granted: McpScope[] = decision.allowWrite ? ['read', 'write'] : ['read']
    const redirectTo = await issueAuthorizationCode(validated.request, session.user.id, granted)
    return { success: true, data: { redirectTo } }
  } catch (error) {
    console.error('Error in approveAuthorization:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to authorize' }
  }
}

/** User declined: return them to the client with `error=access_denied`. */
export async function denyAuthorization(params: AuthorizeParams): Promise<ActionResult<ConsentRedirect>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const validated = await validateAuthorizationRequest(params)
    if (!validated.ok) {
      const { failure } = validated
      if (failure.kind === 'redirect') return { success: true, data: { redirectTo: failure.redirectTo } }
      return { success: false, error: failure.error.message }
    }

    const { redirectUri, state } = validated.request
    return {
      success: true,
      data: { redirectTo: buildRedirectUrl(redirectUri, { error: 'access_denied', state }) },
    }
  } catch (error) {
    console.error('Error in denyAuthorization:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to deny' }
  }
}

/** Active OAuth connections of the current user, newest first. */
export async function listConnectedApps(): Promise<ActionResult<ConnectedAppItem[]>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const grants = await prisma.mcpOAuthGrant.findMany({
      where: { userId: session.user.id, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
      select: { id: true, scopes: true, lastUsedAt: true, createdAt: true, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      success: true,
      data: grants.map(({ client, ...g }) => ({ ...g, clientName: client.name })),
    }
  } catch (error) {
    console.error('Error in listConnectedApps:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load connected apps' }
  }
}

/** Disconnect one of the current user's apps (idempotent; foreign ids are rejected). */
export async function revokeConnectedApp(id: string): Promise<ActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const grant = await prisma.mcpOAuthGrant.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!grant) return { success: false, error: 'Connection not found or access denied' }

    await revokeGrant(grant.id)
    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error in revokeConnectedApp:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to disconnect' }
  }
}
