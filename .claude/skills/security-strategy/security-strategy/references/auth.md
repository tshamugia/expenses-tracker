# Authentication & Authorization (NestJS · Next.js · PostgreSQL)

Covers both halves: proving identity (authn) and enforcing what that identity may do (authz). The highest-severity bugs in this stack live in authz — read the IDOR/BOLA section carefully.

## Table of contents
- Authentication: sessions vs JWT, the decision
- Password & credential handling
- Session / token lifecycle
- Account enumeration & anti-automation
- Next.js auth boundaries (Server Components, Server Actions, route handlers, middleware)
- Authorization: RBAC / ABAC
- IDOR / BOLA — object-level authorization
- Privilege escalation & mass assignment
- Audit checklist

---

## Authentication: sessions vs JWT

Default to **server-side sessions** (opaque id in an httpOnly cookie, state in Postgres/Redis) unless there's a concrete reason for stateless JWTs. Sessions are revocable instantly; JWTs are not until they expire. If JWTs are used:
- Short-lived access token (≤15 min) + rotating refresh token stored httpOnly + server-side allow-list/denylist so logout and compromise are revocable.
- Verify signature *and* `exp`, `iss`, `aud`. Reject `alg: none` and algorithm-confusion (RS→HS) attacks — pin the expected algorithm.
- Never store tokens in `localStorage`/`sessionStorage` (XSS-readable). httpOnly cookies only.
- Tokens carry identity, not authorization decisions you can't re-check. A `role` claim is a hint; re-verify against the DB for sensitive actions.

## Password & credential handling
- Hash with **argon2id** (memory-hard) or bcrypt cost ≥ 12. Never SHA/MD5/unsalted.
- Constant-time comparison for tokens/secrets (`crypto.timingSafeEqual`).
- Enforce length-based password policy (≥12 chars, check against breached-password lists e.g. HIBP k-anonymity) rather than composition rules.
- Reset tokens: single-use, short TTL, hashed at rest, invalidated on use and on password change.

## Session / token lifecycle
- Rotate session id on login (prevent fixation) and on privilege change.
- Invalidate all sessions on password reset / suspected compromise.
- Absolute + idle timeout. Bind sensitive operations (email/password change, payment) to a fresh re-auth or MFA.

## Account enumeration & anti-automation
- Login, signup, reset, and "email exists?" must return **uniform responses and uniform timing** — same message whether or not the account exists.
- Rate-limit and add backoff/lockout on auth endpoints; CAPTCHA or proof-of-work on signup/reset after threshold. Missing rate limiting on auth is a real finding, not a nicety.

## Next.js auth boundaries — each one authenticates independently
This is a frequent source of high-severity bugs. The framework does **not** propagate an auth check from a page to the code beneath it.
- **Server Components / pages**: a `getSession()` check here protects only the rendered page.
- **Server Actions**: are public POST endpoints. Each action must call `getSession()`/auth and authorize the specific object it mutates — independently of the page. A page that checks auth but whose Server Action does not is exploitable directly.
- **Route handlers (`app/api/.../route.ts`)**: same — authenticate and authorize inside the handler.
- **Middleware**: good for coarse redirects (logged-out → /login) but is **not** sufficient authorization — it can be bypassed in some configurations and doesn't see object ownership. Treat it as UX, not a security boundary.
- Never trust `userId`/`tenantId`/`role` coming from a client component as an argument; derive it server-side from the verified session.

```ts
// VULNERABLE Server Action: trusts caller, no per-object check
'use server'
export async function deleteInvoice(invoiceId: string) {
  await db.invoice.delete({ where: { id: invoiceId } }) // any logged-out caller; any tenant
}

// FIXED
'use server'
export async function deleteInvoice(invoiceId: string) {
  const session = await requireSession()            // authn, throws if absent
  const res = await db.invoice.deleteMany({          // deleteMany so a 0-row result = denied, not 404-as-success
    where: { id: invoiceId, tenantId: session.tenantId, ownerId: session.userId },
  })
  if (res.count === 0) throw new ForbiddenError()    // fail closed
}
```

---

## Authorization: RBAC / ABAC
- Centralize policy. In NestJS use guards reading metadata (`@Roles`, `@RequirePermissions`, CASL `@CheckPolicies`) via `Reflector` — never inline `if (user.role === 'admin')` scattered in handlers (impossible to audit, easy to forget).
- Deny by default: a route with no explicit policy is denied, not allowed. Prefer a global guard with explicit `@Public()` opt-out over per-route opt-in.
- Authorization runs **after** authentication and on **every** request — no caching the decision across requests.
- For implementation wiring, defer to `nestjs-backend`; the security judgment (is the policy complete, fail-closed, per-object) stays here.

## IDOR / BOLA — object-level authorization (the top finding)
Every fetch/update/delete by an id supplied by the client must constrain by owner/tenant **in the same query**, atomically. Checking ownership in a second query (TOCTOU) or after fetching is weaker and sometimes racy.

```ts
// VULNERABLE — authenticated, but any id works
@Get(':id')
getOrder(@Param('id') id: string) {
  return this.orders.findUnique({ where: { id } })
}

// FIXED — scoped to the caller in one query
@Get(':id')
getOrder(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  const order = await this.orders.findFirst({
    where: { id, tenantId: user.tenantId, ownerId: user.id },
  })
  if (!order) throw new NotFoundException() // 404 not 403 — don't confirm existence
}
```
- Use `findFirst`/`findMany` with the scope, or `deleteMany`/`updateMany` and check affected-row count — never the unscoped `findUnique`/`delete` by primary key for client-supplied ids.
- Backstop with Postgres RLS (`references/rls.md`) so a forgotten filter still can't cross tenants.
- Return 404 (not 403) for objects the caller can't see, to avoid leaking existence — unless your threat model prefers explicit 403.

## Privilege escalation & mass assignment
- **Mass assignment**: never spread request body into an update (`update({ data: req.body })`). Use an explicit input DTO that omits `role`, `isAdmin`, `tenantId`, `ownerId`, `balance`, etc. Allow-list fields; class-validator `whitelist+forbidNonWhitelisted` or Zod `.strict()`.
- **Excessive exposure**: never `return user`; map to a response DTO that excludes `passwordHash`, internal flags, other tenants' refs.
- Vertical escalation: changing one's own `role`/`tenantId`; horizontal: acting on another user's object (IDOR). Both are HIGH+.

## Audit checklist
- [ ] Every by-id handler filters by owner/tenant in-query
- [ ] No client-supplied identity (userId/role/tenant) is trusted
- [ ] Each Next.js Server Action & route handler authenticates + authorizes itself
- [ ] Passwords argon2id/bcrypt≥12; tokens compared in constant time
- [ ] Tokens in httpOnly cookies, not localStorage; JWTs verify sig+exp+aud+iss, alg pinned
- [ ] Sessions rotate on login/privilege-change; revocable; reset tokens single-use
- [ ] Uniform auth error messages + timing; auth endpoints rate-limited
- [ ] Deny-by-default authorization; no inline role checks
- [ ] Input DTOs allow-list fields (no mass assignment); response DTOs exclude secrets
