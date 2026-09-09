/**
 * OAuth 2.1 authorization server for the MCP endpoint (app/api/mcp).
 *
 * Claude.ai custom connectors cannot send a static Bearer header; they discover
 * an authorization server (RFC 9728 → RFC 8414), register a public client
 * (RFC 7591), run the authorization-code flow with PKCE S256 and refresh
 * tokens. This module is that server. The resource-server side is unchanged:
 * OAuth access tokens are ordinary rows in McpAccessToken (with `grantId`), so
 * `verifyToken` in mcp-auth.ts keeps working for both PATs and OAuth tokens.
 *
 * Secrets (authorization codes, refresh tokens) are never stored raw — only
 * sha256(pepper + raw), reusing hashToken from mcp-auth.ts.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { hashToken, issueToken, normalizeScopes } from '@/lib/services/mcp-auth'
import { MCP_SCOPES, type McpScope } from '@/types/mcp-types'

// ─── Configuration ──────────────────────────────────────────────────────────

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 // 1 hour
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, sliding
export const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
export const REFRESH_TOKEN_PREFIX = 'ext_rt_'
const MAX_REDIRECT_URIS = 10
const MAX_CLIENT_NAME_LENGTH = 100
const SECRET_BYTES = 32

type IssuerEnv = Record<string, string | undefined>

/** Public origin of the app (issuer). Trailing slash removed. */
export function resolveIssuer(env: IssuerEnv = process.env): string {
  const raw = env.AUTH_URL || env.NEXTAUTH_URL || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

/** Canonical MCP resource URL (RFC 8707 audience). */
export function resolveMcpResourceUrl(env: IssuerEnv = process.env): string {
  return `${resolveIssuer(env)}/api/mcp`
}

export const OAUTH_PATHS = {
  authorize: '/oauth/authorize',
  token: '/api/oauth/token',
  register: '/api/oauth/register',
  revoke: '/api/oauth/revoke',
  authorizationServerMetadata: '/.well-known/oauth-authorization-server',
  /** RFC 9728 §3.1 path-suffixed variant for the /api/mcp resource. */
  protectedResourceMetadata: '/.well-known/oauth-protected-resource/api/mcp',
} as const

// ─── Errors ─────────────────────────────────────────────────────────────────

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'invalid_target'
  | 'invalid_client_metadata'
  | 'invalid_redirect_uri'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'server_error'

/** RFC 6749 §5.2 error → JSON body `{ error, error_description }` + HTTP status. */
export class OAuthRequestError extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    message: string,
    public readonly status: number = 400
  ) {
    super(message)
    this.name = 'OAuthRequestError'
  }

  toJSON(): { error: OAuthErrorCode; error_description: string } {
    return { error: this.code, error_description: this.message }
  }
}

// ─── Metadata (pure) ────────────────────────────────────────────────────────

export function buildAuthorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}${OAUTH_PATHS.authorize}`,
    token_endpoint: `${issuer}${OAUTH_PATHS.token}`,
    registration_endpoint: `${issuer}${OAUTH_PATHS.register}`,
    revocation_endpoint: `${issuer}${OAUTH_PATHS.revoke}`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  }
}

export function buildProtectedResourceMetadata(issuer: string) {
  return {
    resource: `${issuer}/api/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
  }
}

// ─── Redirect URIs ──────────────────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isLoopbackRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri)
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** HTTPS, or plain HTTP on a loopback host (RFC 8252 native apps). No fragments. */
export function isAcceptableRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri)
    if (url.hash) return false
    if (url.protocol === 'https:') return true
    return isLoopbackRedirectUri(uri)
  } catch {
    return false
  }
}

/**
 * Exact match (OAuth 2.1), except loopback URIs where the port is ignored
 * (RFC 8252 §7.3 — native clients bind an ephemeral port at runtime).
 */
export function isRedirectUriAllowed(registered: readonly string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true
  if (!isLoopbackRedirectUri(candidate)) return false
  let want: URL
  try {
    want = new URL(candidate)
  } catch {
    return false
  }
  return registered.some((r) => {
    if (!isLoopbackRedirectUri(r)) return false
    const have = new URL(r)
    return (
      have.hostname === want.hostname &&
      have.pathname === want.pathname &&
      have.search === want.search
    )
  })
}

/** Append query parameters to a redirect URI, keeping its existing query. */
export function buildRedirectUrl(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  return url.toString()
}

// ─── Scopes ─────────────────────────────────────────────────────────────────

/** Parse a space-separated scope string; unknown scopes → invalid_scope. */
export function parseScopeParam(scope: string | undefined | null): McpScope[] {
  if (!scope || !scope.trim()) return [...MCP_SCOPES]
  const parts = scope.trim().split(/\s+/)
  for (const s of parts) {
    if (!(MCP_SCOPES as readonly string[]).includes(s)) {
      throw new OAuthRequestError('invalid_scope', `Unknown scope "${s}"`)
    }
  }
  return normalizeScopes(parts)
}

// ─── PKCE ───────────────────────────────────────────────────────────────────

const PKCE_CHARSET = /^[A-Za-z0-9\-._~]{43,128}$/

export function isValidCodeChallenge(value: string | undefined): value is string {
  return typeof value === 'string' && PKCE_CHARSET.test(value)
}

export function computeCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

export function verifyCodeVerifier(codeVerifier: string | undefined, codeChallenge: string): boolean {
  if (!isValidCodeChallenge(codeVerifier)) return false
  const expected = Buffer.from(computeCodeChallenge(codeVerifier))
  const actual = Buffer.from(codeChallenge)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// ─── Dynamic client registration (RFC 7591) ─────────────────────────────────

const registrationSchema = z.object({
  redirect_uris: z
    .array(z.string().max(2048))
    .min(1, 'redirect_uris must contain at least one URI')
    .max(MAX_REDIRECT_URIS),
  client_name: z.string().trim().max(MAX_CLIENT_NAME_LENGTH).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

export interface RegisteredClient {
  client_id: string
  client_id_issued_at: number
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: 'none'
  grant_types: string[]
  response_types: string[]
}

/** Validate RFC 7591 metadata and persist a public client. */
export async function registerClient(body: unknown): Promise<RegisteredClient> {
  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    throw new OAuthRequestError('invalid_client_metadata', parsed.error.issues[0]?.message ?? 'Invalid metadata')
  }
  const meta = parsed.data

  for (const uri of meta.redirect_uris) {
    if (!isAcceptableRedirectUri(uri)) {
      throw new OAuthRequestError('invalid_redirect_uri', `Redirect URI not allowed: ${uri}`)
    }
  }
  if (meta.token_endpoint_auth_method && meta.token_endpoint_auth_method !== 'none') {
    throw new OAuthRequestError(
      'invalid_client_metadata',
      'Only public clients (token_endpoint_auth_method "none") are supported'
    )
  }
  const grantTypes = meta.grant_types ?? ['authorization_code', 'refresh_token']
  if (grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
    throw new OAuthRequestError('invalid_client_metadata', 'Unsupported grant_types')
  }
  const responseTypes = meta.response_types ?? ['code']
  if (responseTypes.some((r) => r !== 'code')) {
    throw new OAuthRequestError('invalid_client_metadata', 'Unsupported response_types')
  }

  const client = await prisma.mcpOAuthClient.create({
    data: {
      name: meta.client_name || 'MCP client',
      redirectUris: Array.from(new Set(meta.redirect_uris)),
    },
  })

  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: grantTypes,
    response_types: responseTypes,
  }
}

// ─── Authorization request ──────────────────────────────────────────────────

export interface AuthorizationRequest {
  client: { id: string; name: string }
  redirectUri: string
  scopes: McpScope[]
  codeChallenge: string
  state?: string
  resource?: string
}

/**
 * Error in an authorization request. `display` errors (unknown client, bad
 * redirect URI) must be shown to the user and NEVER redirected (OAuth 2.1
 * §4.1.2.1); `redirect` errors go back to the client via the redirect URI.
 */
export type AuthorizationRequestFailure =
  | { kind: 'display'; error: OAuthRequestError }
  | { kind: 'redirect'; error: OAuthRequestError; redirectTo: string }

export type AuthorizationRequestResult =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; failure: AuthorizationRequestFailure }

export type AuthorizeParams = Record<string, string | string[] | undefined>

function single(params: AuthorizeParams, key: string): string | undefined {
  const v = params[key]
  return Array.isArray(v) ? v[0] : v
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate /oauth/authorize query parameters. Safe to call from page and action. */
export async function validateAuthorizationRequest(
  params: AuthorizeParams,
  resourceUrl: string = resolveMcpResourceUrl()
): Promise<AuthorizationRequestResult> {
  const display = (error: OAuthRequestError): AuthorizationRequestResult => ({
    ok: false,
    failure: { kind: 'display', error },
  })

  const clientId = single(params, 'client_id')
  const redirectUri = single(params, 'redirect_uri')
  if (!clientId || !UUID_RE.test(clientId)) {
    return display(new OAuthRequestError('invalid_client', 'Unknown client', 401))
  }
  const client = await prisma.mcpOAuthClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, redirectUris: true },
  })
  if (!client) return display(new OAuthRequestError('invalid_client', 'Unknown client', 401))
  if (!redirectUri || !isRedirectUriAllowed(client.redirectUris, redirectUri)) {
    return display(new OAuthRequestError('invalid_request', 'redirect_uri is not registered for this client'))
  }

  const state = single(params, 'state')
  const redirectError = (error: OAuthRequestError): AuthorizationRequestResult => ({
    ok: false,
    failure: {
      kind: 'redirect',
      error,
      redirectTo: buildRedirectUrl(redirectUri, { error: error.code, error_description: error.message, state }),
    },
  })

  if (single(params, 'response_type') !== 'code') {
    return redirectError(new OAuthRequestError('unsupported_response_type', 'Only response_type=code is supported'))
  }
  const codeChallenge = single(params, 'code_challenge')
  if (!isValidCodeChallenge(codeChallenge)) {
    return redirectError(new OAuthRequestError('invalid_request', 'code_challenge is required (PKCE)'))
  }
  if (single(params, 'code_challenge_method') !== 'S256') {
    return redirectError(new OAuthRequestError('invalid_request', 'code_challenge_method must be S256'))
  }
  let scopes: McpScope[]
  try {
    scopes = parseScopeParam(single(params, 'scope'))
  } catch (error) {
    return redirectError(error as OAuthRequestError)
  }
  const resource = single(params, 'resource')
  if (resource !== undefined && resource !== resourceUrl) {
    return redirectError(new OAuthRequestError('invalid_target', 'resource does not identify this MCP server'))
  }

  return {
    ok: true,
    request: { client: { id: client.id, name: client.name }, redirectUri, scopes, codeChallenge, state, resource },
  }
}

// ─── Authorization code ─────────────────────────────────────────────────────

function randomSecret(prefix = ''): string {
  return prefix + randomBytes(SECRET_BYTES).toString('base64url')
}

/** Persist a single-use code for the consented request; returns the client redirect URL. */
export async function issueAuthorizationCode(
  request: AuthorizationRequest,
  userId: string,
  grantedScopes: readonly McpScope[],
  now: Date = new Date()
): Promise<string> {
  const scopes = normalizeScopes(grantedScopes).filter((s) => request.scopes.includes(s))
  const code = randomSecret()
  await prisma.mcpOAuthAuthorizationCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: request.client.id,
      userId,
      redirectUri: request.redirectUri,
      scopes,
      codeChallenge: request.codeChallenge,
      resource: request.resource ?? null,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS),
    },
  })
  return buildRedirectUrl(request.redirectUri, { code, state: request.state })
}

// ─── Token endpoint ─────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export interface AuthorizationCodeGrantInput {
  code?: string
  clientId?: string
  redirectUri?: string
  codeVerifier?: string
  resource?: string
}

export interface RefreshTokenGrantInput {
  refreshToken?: string
  clientId?: string
  scope?: string
}

async function issueAccessToken(
  grant: { id: string; userId: string; scopes: string[]; client: { name: string } },
  scopes: readonly McpScope[],
  now: Date
): Promise<TokenResponse> {
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000)
  const issued = await issueToken(grant.userId, grant.client.name, scopes, expiresAt, { grantId: grant.id })
  return {
    access_token: issued.raw,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: '', // filled in by the caller
    scope: scopes.join(' '),
  }
}

/** grant_type=authorization_code: redeem a code (once) for tokens. */
export async function exchangeAuthorizationCode(
  input: AuthorizationCodeGrantInput,
  now: Date = new Date(),
  resourceUrl: string = resolveMcpResourceUrl()
): Promise<TokenResponse> {
  const { code, clientId, redirectUri, codeVerifier, resource } = input
  if (!code || !clientId || !codeVerifier) {
    throw new OAuthRequestError('invalid_request', 'code, client_id and code_verifier are required')
  }
  if (resource !== undefined && resource !== resourceUrl) {
    throw new OAuthRequestError('invalid_target', 'resource does not identify this MCP server')
  }

  const record = await prisma.mcpOAuthAuthorizationCode.findUnique({ where: { codeHash: hashToken(code) } })
  if (!record || record.clientId !== clientId) {
    throw new OAuthRequestError('invalid_grant', 'Authorization code is invalid')
  }
  if (record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
    throw new OAuthRequestError('invalid_grant', 'Authorization code has expired or was already used')
  }
  // redirect_uri is required when it was part of the authorization request (always, here).
  if (redirectUri !== record.redirectUri) {
    throw new OAuthRequestError('invalid_grant', 'redirect_uri does not match the authorization request')
  }
  if (!verifyCodeVerifier(codeVerifier, record.codeChallenge)) {
    throw new OAuthRequestError('invalid_grant', 'PKCE verification failed')
  }

  // Mark used atomically — a concurrent second redemption sees count 0.
  const claimed = await prisma.mcpOAuthAuthorizationCode.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  })
  if (claimed.count !== 1) {
    throw new OAuthRequestError('invalid_grant', 'Authorization code was already used')
  }

  const refreshToken = randomSecret(REFRESH_TOKEN_PREFIX)
  const grant = await prisma.mcpOAuthGrant.create({
    data: {
      clientId: record.clientId,
      userId: record.userId,
      scopes: record.scopes,
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      lastUsedAt: now,
    },
    include: { client: { select: { name: true } } },
  })

  const scopes = normalizeScopes(grant.scopes)
  const response = await issueAccessToken(grant, scopes, now)
  return { ...response, refresh_token: refreshToken }
}

/** grant_type=refresh_token: rotate the refresh token and mint a new access token. */
export async function refreshAccessToken(
  input: RefreshTokenGrantInput,
  now: Date = new Date()
): Promise<TokenResponse> {
  const { refreshToken, clientId, scope } = input
  if (!refreshToken || !clientId || !refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
    throw new OAuthRequestError('invalid_request', 'refresh_token and client_id are required')
  }
  const presentedHash = hashToken(refreshToken)

  const grant = await prisma.mcpOAuthGrant.findUnique({
    where: { refreshTokenHash: presentedHash },
    include: { client: { select: { name: true } } },
  })

  if (!grant) {
    // A rotated-out token being replayed means it leaked: kill the whole grant.
    const replayed = await prisma.mcpOAuthGrant.findUnique({
      where: { previousRefreshTokenHash: presentedHash },
      select: { id: true },
    })
    if (replayed) await revokeGrant(replayed.id, now)
    throw new OAuthRequestError('invalid_grant', 'Refresh token is invalid')
  }
  if (grant.clientId !== clientId) throw new OAuthRequestError('invalid_grant', 'Refresh token is invalid')
  if (grant.revokedAt || grant.refreshExpiresAt.getTime() <= now.getTime()) {
    throw new OAuthRequestError('invalid_grant', 'Refresh token has expired or was revoked')
  }

  // Optional down-scoping (RFC 6749 §6); never widen.
  const granted = normalizeScopes(grant.scopes)
  let scopes = granted
  if (scope) {
    const requested = parseScopeParam(scope)
    if (requested.some((s) => !granted.includes(s))) {
      throw new OAuthRequestError('invalid_scope', 'Requested scope exceeds the granted scope')
    }
    scopes = requested
  }

  const nextRefreshToken = randomSecret(REFRESH_TOKEN_PREFIX)
  await prisma.$transaction([
    prisma.mcpOAuthGrant.update({
      where: { id: grant.id },
      data: {
        refreshTokenHash: hashToken(nextRefreshToken),
        previousRefreshTokenHash: presentedHash,
        refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        lastUsedAt: now,
      },
    }),
    prisma.mcpAccessToken.updateMany({
      where: { grantId: grant.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ])

  const response = await issueAccessToken(grant, scopes, now)
  return { ...response, refresh_token: nextRefreshToken }
}

// ─── Revocation ─────────────────────────────────────────────────────────────

/** Revoke a grant and every access token issued under it. Idempotent. */
export async function revokeGrant(grantId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction([
    prisma.mcpOAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.mcpAccessToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } }),
  ])
}

/**
 * RFC 7009: revoke by token value (access or refresh). Unknown tokens are
 * silently ignored, as the RFC requires.
 */
export async function revokeByToken(token: string | undefined, now: Date = new Date()): Promise<void> {
  if (!token) return
  const tokenHash = hashToken(token)

  if (token.startsWith(REFRESH_TOKEN_PREFIX)) {
    const grant = await prisma.mcpOAuthGrant.findUnique({ where: { refreshTokenHash: tokenHash }, select: { id: true } })
    if (grant) await revokeGrant(grant.id, now)
    return
  }

  const access = await prisma.mcpAccessToken.findUnique({ where: { tokenHash }, select: { id: true, grantId: true } })
  if (!access) return
  // Revoking an OAuth access token revokes the connection it belongs to.
  if (access.grantId) await revokeGrant(access.grantId, now)
  else await prisma.mcpAccessToken.updateMany({ where: { id: access.id, revokedAt: null }, data: { revokedAt: now } })
}
