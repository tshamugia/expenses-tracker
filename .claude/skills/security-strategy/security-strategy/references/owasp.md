# OWASP review pass (NestJS · Next.js · PostgreSQL)

Use this for broad "review / audit / is this secure" requests. Walk the categories top to bottom, but report findings ordered by *your* assessed severity, not by category order. Each entry gives the failure modes specific to this stack and the detection cues to grep/read for.

## Table of contents
- OWASP Top 10 (2021) mapped to this stack
- OWASP API Security Top 10 (2023) — APIs deserve their own pass
- Secure headers, CORS, CSP baseline
- Quick detection cheat sheet

---

## OWASP Top 10 (2021)

### A01 Broken Access Control — *almost always the top finding*
Failure modes here:
- **IDOR / BOLA**: `findUnique({ where: { id } })` without an owner/tenant filter. Detection: any handler that takes an id from params/body and queries by it alone.
- **Missing function-level authz**: a `@Roles('admin')` guard on one admin route but not its sibling. Detection: list every route in a controller; confirm each privileged one has a guard.
- **Trusting client-supplied role/tenant**: reading `req.body.role` or a Next.js client component passing `userId`. The server must derive identity from the verified session/JWT, never from request data.
- **Next.js**: a Server Action or route handler that does the mutation but skips the auth check that the page component did. Each Server Action authenticates and authorizes independently — page-level checks don't protect it.

Primary control: per-object authorization in the data query itself. Backstop: RLS (`references/rls.md`).

### A02 Cryptographic Failures
- Passwords hashed with argon2id (preferred) or bcrypt cost ≥ 12 — never SHA/MD5, never unsalted. Detection: grep `createHash`, `md5`, `sha1` near password.
- Secrets/PII in transit only over TLS; at rest, sensitive columns encrypted or tokenized as policy requires.
- JWTs signed with a strong algorithm and a real secret; reject `alg: none`; verify `aud`/`iss`/`exp`. Detection: grep `jwt.verify`/`jwt.decode` — `decode` without `verify` is a finding.
- No secret material in `NEXT_PUBLIC_*`. See `references/secrets.md`.

### A03 Injection
- SQL: ORM builders parameterize; `$queryRawUnsafe` / `$executeRawUnsafe` / string-built `sql` are findings. See `references/bug-finder.md`.
- Command injection: `child_process.exec(\`...${userInput}\`)` → use `execFile` with an args array.
- XSS in Next.js: `dangerouslySetInnerHTML`, unsanitized markdown, reflected query params. React escapes by default — flag every escape hatch.

### A04 Insecure Design
Threat-model the feature, not just the code. Ask: what's the abuse case? Rate limiting on auth/OTP endpoints, lockout/backoff, business-logic limits (can a user request 10,000 password resets, negative quantities, replayed idempotency keys?).

### A05 Security Misconfiguration
- NestJS: global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` so unexpected props are rejected. Detection: check `main.ts`.
- Verbose errors/stack traces returned to clients in prod; `app.enableCors()` with no options = wildcard; default credentials; debug endpoints exposed.
- Next.js: source maps or `NODE_ENV` not `production`; misconfigured `next.config` rewrites that proxy to internal hosts (SSRF surface).

### A06 Vulnerable & Outdated Components
`npm audit` / `pnpm audit`, Snyk, or Dependabot. Pin and review transitive deps. Flag known-bad: old `jsonwebtoken`, `next` below a security-patch release, `lodash`/`minimist` prototype-pollution versions.

### A07 Identification & Authentication Failures
See `references/auth.md` in full. Cues: weak session expiry, no rotation on privilege change, account enumeration via differing error messages/timing, missing MFA on sensitive ops, JWT in `localStorage` (XSS-stealable) vs httpOnly cookie.

### A08 Software & Data Integrity Failures
Unsigned/unpinned CI dependencies, deserializing untrusted data (`JSON.parse` is fine; `eval`, `Function`, `node-serialize` are not), missing Subresource Integrity for third-party scripts.

### A09 Logging & Monitoring Failures
Security events (login success/fail, authz denials, admin actions, tenant-context switches) are logged with who/what/when/outcome and a correlation id — and secrets/PII are redacted from logs. Absence of an audit trail on sensitive actions is a MEDIUM finding.

### A10 SSRF
User-controlled URLs fetched server-side (webhooks, "import from URL", image proxies, Next.js rewrites). Validate against an allow-list of hosts; block private/link-local ranges (169.254.0.0/16, 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, `::1`, metadata 169.254.169.254); resolve-then-check to defeat DNS rebinding. See `references/bug-finder.md`.

---

## OWASP API Security Top 10 (2023)

APIs (your NestJS layer) get a dedicated pass — several risks are API-specific:
- **API1 BOLA** — object-level authz; the #1 API risk. Same as IDOR above.
- **API2 Broken Authentication** — see `references/auth.md`.
- **API3 Broken Object Property Level Authorization** — mass assignment (user sets `isAdmin: true` in a PATCH body) and excessive data exposure (returning the full entity incl. `passwordHash`, internal flags). Fix: explicit input DTOs (allow-list) and explicit response DTOs/serializers (`@Exclude`/select), never `return user`.
- **API4 Unrestricted Resource Consumption** — rate limiting, pagination caps, payload size limits, query-depth limits (GraphQL), upload limits.
- **API5 Broken Function Level Authorization** — admin routes guarded consistently.
- **API6 Unrestricted Access to Sensitive Business Flows** — anti-automation on signups, purchases, etc.
- **API7 SSRF** — see A10.
- **API8 Security Misconfiguration** — see A05.
- **API9 Improper Inventory Management** — old `/v1` endpoints, debug/staging APIs reachable, undocumented routes.
- **API10 Unsafe Consumption of 3rd-party APIs** — validate and sandbox responses from upstreams just like user input.

---

## Secure headers, CORS, CSP baseline

NestJS: use `helmet`. Next.js: set headers in `next.config.js` or middleware.

- **CORS**: explicit origin allow-list, `credentials: true` only with a specific origin (never `*` + credentials — browsers block it, and it signals a misconfig). Reject wildcard for authenticated APIs.
- **CSP**: a real policy, not `unsafe-inline`/`unsafe-eval` everywhere. For Next.js, use a nonce-based CSP via middleware. Absence of CSP is LOW-MEDIUM depending on XSS surface.
- Also set: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`.
- Cookies: `httpOnly`, `Secure`, `SameSite=Lax` (or `Strict` for high-value), scoped `Path`/`Domain`.

---

## Quick detection cheat sheet

```bash
# Access control / IDOR candidates
grep -rEn "findUnique|findFirst|findOne" --include=*.ts | grep -i "params|body|query"
# Raw SQL
grep -rEn "queryRawUnsafe|executeRawUnsafe|\\\$queryRaw|sql\`" --include=*.ts
# XSS escape hatches
grep -rEn "dangerouslySetInnerHTML|innerHTML" --include=*.tsx --include=*.ts
# JWT verify vs decode
grep -rEn "jwt\.(decode|verify)" --include=*.ts
# Secrets to client
grep -rEn "NEXT_PUBLIC_" --include=*.ts --include=*.tsx
# Command exec
grep -rEn "exec\(|execSync\(" --include=*.ts
# CORS wildcard
grep -rEn "enableCors|Access-Control-Allow-Origin" --include=*.ts
```
Greps surface candidates, not confirmed bugs — read each hit and assess reachability before reporting.
