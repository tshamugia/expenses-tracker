# ExtraTracker MCP Server

ExtraTracker exposes the user's financial data to AI clients (Claude Desktop,
Claude Code, Cursor, …) through a **Model Context Protocol (MCP)** server that
lives inside the Next.js app at **`/api/mcp`** (Streamable HTTP).

It respects the project's constraints:

- **Single Next.js app** — one route handler, no extra service.
- **Schema changes only via `npm run db:migrate:dev`** (migration
  `20260909161456_add_mcp_access_token`, additive).
- **Auth.js sessions are cookie-bound** and unusable by headless clients, so the
  MCP route has its own auth path: **personal access tokens (PAT)** generated in
  Settings → *MCP access*, and — for Claude.ai custom connectors, which cannot
  send a static header — an **in-app OAuth 2.1 authorization server** (§2b).
- **Money math is never re-implemented** — tools call the same view-model
  builders the app's Server Actions use.
- **Tests are mandatory** — every new module has a Vitest file next to it.

---

## 1. Architecture

```
Claude.ai ──(401 → /.well-known discovery → DCR → /oauth/authorize consent → /api/oauth/token)──▶ lib/services/mcp-oauth.ts
                                                                          │  issues McpAccessToken rows (grantId set) + rotating refresh tokens
                                                                          ▼
Claude client ──(MCP Streamable HTTP, Authorization: Bearer ext_mcp_…)──▶ app/api/mcp/route.ts
                                                                          │  rate limit (per IP, failed auths)
                                                                          │  withMcpAuth → lib/services/mcp-auth.ts (verifyToken → { userId, scopes })
                                                                          ▼
                                                              lib/services/mcp-tools.ts (zod-validated tools, scope gate)
                                                                          ▼
                                                              lib/services/mcp-data.ts (userId-first adapters, Decimal → number)
                                                                          ▼
                                    plan-view.ts · debt-overview.ts · goal-overview.ts · quick-add.ts · createExpense · Prisma
```

| Concern | Where |
|---|---|
| Route (Node runtime, `force-dynamic`) | `app/api/mcp/route.ts` |
| Token hashing, issue, verify | `lib/services/mcp-auth.ts` |
| Tool registration + scope guard | `lib/services/mcp-tools.ts` |
| Data adapters | `lib/services/mcp-data.ts` |
| Failed-auth rate limiter | `lib/services/rate-limit.ts` |
| Token Server Actions (create/list/revoke) | `lib/actions/mcp-token-actions.ts` |
| OAuth 2.1 authorization server (metadata, DCR, codes, tokens, refresh, revocation) | `lib/services/mcp-oauth.ts` (+ `mcp-oauth-http.ts` response helpers) |
| OAuth route handlers | `app/.well-known/oauth-authorization-server`, `app/.well-known/oauth-protected-resource/[[...resource]]`, `app/api/oauth/{register,token,revoke}` |
| Consent screen + Server Actions | `app/oauth/authorize/page.tsx`, `components/oauth/consent-form.tsx`, `lib/actions/mcp-oauth-actions.ts` |
| Settings UI (bilingual, namespaces `McpTokens`, `OAuthConsent`) | `components/settings/mcp-tokens-settings.tsx` |
| Types | `types/mcp-types.ts` |
| Prisma models | `McpAccessToken`, `McpOAuthClient`, `McpOAuthAuthorizationCode`, `McpOAuthGrant` in `prisma/schema.prisma` |

Packages: `mcp-handler@^2`, `@modelcontextprotocol/server@^2`, `zod@^4`.
(`mcp-handler` 2.x is built on MCP SDK v2; the 1.x `@modelcontextprotocol/sdk`
API — `server.tool(...)`, `[transport]` routes, SSE — is not used.)

To make the view models reusable, the following builders were extracted from
session-bound Server Actions into userId-first services (the actions now only
do `auth()` → builder → `revalidatePath`):

| Service | Exports | Previously private in |
|---|---|---|
| `lib/services/plan-view.ts` | `buildPlanView`, `computeStabilityProgress`, `buildDashboardData` | `plan-actions.ts` |
| `lib/services/debt-overview.ts` | `serializeDebt`, `serializeItem`, `computeDebtProgress`, `buildDebtsOverview` | `debt-actions.ts` |
| `lib/services/goal-overview.ts` | `serializeGoal`, `computeProgress`, `reserveExplanation`, `ensureReserveExists`, `buildGoalsOverview` | `goal-actions.ts` |
| `lib/services/quick-add.ts` | `addExpenseTransaction` | `transaction-actions.ts` |

---

## 2. Authentication — personal access tokens

- Format: `ext_mcp_` + 43 base64url chars (256 bits of entropy).
- Storage: only `sha256(MCP_TOKEN_PEPPER + raw)` (`tokenHash`, unique) plus
  the last four characters for display. The raw token is returned **once** by
  `createMcpToken` and shown in a copy-once dialog.
- Scopes: `read` (always) and optionally `write`. Write tools return
  `isError` for read-only tokens.
- Expiry (optional) and revocation (`revokedAt`) are honoured by
  `verifyToken`; `lastUsedAt` is bumped on every successful call.
- Limits: at most 10 active tokens per user; expiry 1 day – 5 years.
- `MCP_TOKEN_PEPPER` **must** be set in every environment. Without it the route
  fails closed (every request → 401).
- Failed authentications are rate-limited per client address
  (`x-forwarded-for`): 20 failures per minute → `429` with `Retry-After`.
- Tools resolve `userId` **only** from the verified token
  (`ctx.http.authInfo.extra`); a `userId` in tool arguments is never trusted.

```prisma
model McpAccessToken {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @db.Uuid
  name       String
  tokenHash  String    @unique
  lastFour   String
  scopes     String[]  @default(["read"])
  lastUsedAt DateTime?
  expiresAt  DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

---

## 2b. Authentication — OAuth 2.1 (Claude.ai custom connectors)

Claude.ai / Claude Desktop / Claude mobile add a server as a **custom
connector** by URL and cannot attach a static header. They require the MCP
authorization spec (OAuth 2.1, PKCE S256, dynamic client registration). The
app is its own authorization server — no third-party IdP, no extra service,
no new environment variables (the issuer is `AUTH_URL`, secrets are hashed
with the existing `MCP_TOKEN_PEPPER`). Migration `20260909180403_add_mcp_oauth`
is additive.

```
Claude.ai                                   ExtraTracker
   │ POST /api/mcp (no token)                  │
   │◀─ 401 WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"
   │ GET /.well-known/oauth-protected-resource/api/mcp  → { resource, authorization_servers: [issuer] }
   │ GET /.well-known/oauth-authorization-server        → endpoints, S256, DCR, scopes
   │ POST /api/oauth/register (RFC 7591, JSON)          → client_id (public client, redirect URIs pinned)
   │ browser → /oauth/authorize?client_id&redirect_uri&code_challenge&scope&state&resource
   │           (Auth.js session required → /login?callbackUrl=… → consent card → Approve/Deny)
   │◀─ 302 https://claude.ai/api/mcp/auth_callback?code=…&state=…
   │ POST /api/oauth/token (form-urlencoded, code + code_verifier)  → access (1 h) + refresh token
   │ POST /api/mcp  Authorization: Bearer ext_mcp_…                  → tools
   │ POST /api/oauth/token grant_type=refresh_token                   → rotated refresh token + new access token
```

Design and security properties:

- **One resource-server path.** OAuth access tokens are ordinary `McpAccessToken`
  rows with `grantId` set, so `verifyToken`, the rate limiter and the tool scope
  gate are shared with PATs. Nothing in `/api/mcp` knows about OAuth beyond the
  `WWW-Authenticate` challenge.
- **Storage:** authorization codes and refresh tokens are stored only as
  `sha256(MCP_TOKEN_PEPPER + raw)`; raw values exist in the HTTP response only.
- **Authorization codes** live 10 minutes, are single-use (claimed with an
  atomic `updateMany … usedAt: null`), and are bound to client, exact
  `redirect_uri`, PKCE challenge and `resource`.
- **Redirect URIs** must be `https://…` or loopback `http://localhost|127.0.0.1|[::1]`
  (RFC 8252, port ignored for Claude Code). Unknown clients / unregistered
  URIs render an error page and are **never** redirected.
- **Consent:** the user sees the client name, the redirect host (with a warning
  for loopback), the requested scopes and can withhold `write`. Approve/Deny
  are Server Actions that re-validate the raw parameters — nothing from the
  form is trusted.
- **Refresh tokens** (`ext_rt_…`, 30-day sliding) are rotated on every use;
  presenting a rotated-out token revokes the whole grant (reuse detection).
  Refreshing revokes the previous access tokens of that grant. Down-scoping via
  `scope` is allowed, widening is `invalid_scope`.
- **`resource` (RFC 8707)** must equal `${AUTH_URL}/api/mcp` when present;
  tokens are only ever valid for this one resource.
- **Revocation:** RFC 7009 endpoint (`/api/oauth/revoke`, always 200) and
  Settings → *Connected apps* → *Disconnect* (`revokeGrant` → grant + all its
  access tokens). PAT list excludes OAuth tokens.
- **Rate limits:** registrations 10/min per address; token-endpoint failures
  20/min per address (`429` + `Retry-After`).
- **Only public clients** (`token_endpoint_auth_method: none`) are accepted — that
  is what Claude registers. Client-secret flows and CIMD are not implemented.
- The `/login` form honours a same-origin `callbackUrl` (`lib/utils/safe-redirect.ts`)
  so the user lands back on the consent screen after signing in.

---

## 3. Tool surface

| Tool | Scope | Input | Backed by |
|---|---|---|---|
| `get_dashboard` | read | — | `buildDashboardData` (Safe-to-Spend, plan status, live verdict, stability, debts, goals) |
| `get_monthly_plan` | read | `month?: YYYY-MM` | `buildPlanView` — returns `plan: null` if the month has no plan (never generates one) |
| `list_expenses` | read | `limit?` | `prisma.expense` — fixed bills with paid/overdue flags |
| `list_transactions` | read | `type?`, `categoryId?`, `from?`, `to?`, `limit?` | `prisma.transaction` ledger, newest first |
| `list_categories` | read | — | `prisma.category` (id, name, kind, monthly limit) |
| `list_debts` | read | — | `buildDebtsOverview` (amortization progress, totals, avalanche/snowball) |
| `list_goals` | read | — | `buildGoalsOverview` (reserve first, progress, what-if for proposed goals) |
| `create_expense` | **write** | `title`, `amount`, `currency`, `category?`, `description?`, `nextDueDate?`, `isRecurring?`, `recurrenceRule?` | `createExpense` (creates the first pending Payment; overdue notification) |
| `add_transaction` | **write** | `amount`, `currency?`, `categoryId?` or `categoryName?`, `description?`, `date?` | `addExpenseTransaction` (Quick Add; returns the category soft-limit status) |

All inputs are validated with zod (limits 1–200, ISO dates, `GEL|USD|EUR`).
Results are JSON text content; amounts are numbers (never Prisma `Decimal`).
Errors inside a tool are returned as `isError` results, not protocol errors.

---

## 4. Environment

```bash
# .env.local and Railway service variables
MCP_TOKEN_PEPPER=<openssl rand -base64 32>
```

The Settings card displays the endpoint as `${AUTH_URL ?? NEXTAUTH_URL}/api/mcp`.

---

## 5. Connecting a client

Generate a token in **Settings → MCP access**, then:

**Claude.ai / Claude Desktop / Claude mobile (custom connector, OAuth)**

1. Claude.ai → *Settings → Connectors → Add custom connector* (Team/Enterprise:
   *Organization settings → Connectors → Add → Custom → Web*).
2. URL: `https://extracker-production.up.railway.app/api/mcp`. Leave OAuth
   Client ID / Secret empty (Claude registers itself).
3. Click *Connect* → sign in to ExtraTracker if asked → review the consent
   card (toggle off *Add expenses and transactions* for read-only) → *Approve*.
4. The connection shows up in ExtraTracker under *Settings → MCP access →
   Connected apps*, where it can be disconnected at any time.

**Claude Code** (PAT; OAuth also works — Claude Code's loopback redirect is accepted)

```bash
claude mcp add --transport http extracker https://extracker-production.up.railway.app/api/mcp \
  --header "Authorization: Bearer ext_mcp_XXXXXXXX"
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "extracker": {
      "type": "http",
      "url": "https://extracker-production.up.railway.app/api/mcp",
      "headers": { "Authorization": "Bearer ext_mcp_XXXXXXXX" }
    }
  }
}
```

**MCP Inspector** (local): `npx @modelcontextprotocol/inspector`, transport
*Streamable HTTP*, URL `http://localhost:3000/api/mcp`, header
`Authorization: Bearer ext_mcp_…`.

Smoke test without a client:

```bash
# 401 without a token
curl -i -X POST https://<host>/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# tools/list with a token
curl -s -X POST https://<host>/api/mcp -H "Authorization: Bearer ext_mcp_…" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

---

## 6. Tests

| File | Covers |
|---|---|
| `lib/services/mcp-auth.test.ts` | hash determinism/pepper, token format, issue stores hash only, verify: unknown/revoked/expired/missing pepper, lastUsedAt bump |
| `lib/services/mcp-data.test.ts` | userId scoping of every query, limit clamping, Decimal → number, category-by-name resolution, write delegation |
| `lib/services/mcp-tools.test.ts` | tool surface + annotations, principal from token only, write-scope gate, error → isError, zod schemas |
| `lib/services/rate-limit.test.ts` | window/threshold/expiry/prune, client key extraction |
| `lib/actions/mcp-token-actions.test.ts` | auth rejection, name/expiry validation, active-token cap, revoke ownership + idempotency |
| `lib/services/mcp-oauth.test.ts` | metadata, redirect-URI rules (https/loopback, exact vs port-agnostic), scope parsing, PKCE, DCR validation, authorize validation (display vs redirect errors, state), code issue/exchange (single use, expiry, binding, race), refresh rotation + reuse detection + down-scoping, revocation |
| `lib/services/mcp-oauth-http.test.ts` | form/JSON body parsing, cache headers, error mapping without leaking internals |
| `app/api/oauth/token/route.test.ts`, `register/route.test.ts`, `app/.well-known/oauth-authorization-server/route.test.ts` | grant dispatch, RFC 6749 error bodies, per-address rate limiting, CORS, discovery documents |
| `lib/actions/mcp-oauth-actions.test.ts` | auth rejection, re-validation of raw params, write withheld, deny → access_denied, connected-apps ownership |
| `components/oauth/consent-form.test.tsx` | client/host/permissions rendering, loopback warning, approve with/without write, deny, error state |
| `lib/utils/safe-redirect.test.ts` | callbackUrl open-redirect guard |
| `components/settings/mcp-tokens-settings.test.tsx` | list rendering, create flow (secret shown once), validation, revoke confirm/cancel |
| existing `plan-/debt-/goal-/transaction-actions.test.ts` | still cover the extracted builders through the actions |

`npm run test` and `npm run build` must be green before a PR.

---

## 7. Deployment

No new service. The route ships with the image; the migration is applied by the
Railway pre-deploy command `prisma migrate deploy` after merge.

Checklist:

- [x] `McpAccessToken` model + additive migration committed.
- [x] `MCP_TOKEN_PEPPER` set on the Railway `extracker` service.
- [x] After deploy: `POST /api/mcp` without a token returns 401; with a token, `tools/list` returns the 9 tools.
- [x] OAuth models + additive migration `20260909180403_add_mcp_oauth` committed; `AUTH_URL` on Railway already equals the public URL (the OAuth issuer).
- [ ] After deploy: `GET /.well-known/oauth-authorization-server` returns the issuer `https://extracker-production.up.railway.app`; add the custom connector in Claude.ai and complete the consent flow.

Security notes:

- Tokens hashed with a server-side pepper; raw shown once; revocation and expiry honoured.
- Per-user data isolation is enforced by the token → `userId` mapping and `where: { userId }` on every query (tested).
- Writes need the explicit `write` scope; default tokens are read-only.
- Brute-force brake: per-IP failed-auth rate limit (in-process). Add an edge limit for stronger guarantees.
- Production is HTTPS-only behind Railway's proxy.
