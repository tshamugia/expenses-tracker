---
name: security-strategy
description: Application security expert for TypeScript apps with NestJS backends, Next.js frontends, and PostgreSQL (Prisma/Drizzle). Use whenever the user reviews, hardens, threat-models, or audits security anywhere in the stack — OWASP Top 10 / API Security Top 10 review, authentication & session design, authorization (RBAC/ABAC) and IDOR prevention, PostgreSQL Row-Level Security (RLS) and tenant isolation, secrets management & rotation, secure headers/CSP/CORS, input validation, and finding/triaging security bugs in code. Triggers on "security review," "audit," "OWASP," "vulnerability," "is this secure," "RLS," "row-level security," "multi-tenant isolation," "IDOR," "broken access control," "JWT," "session," "secrets," "leaked key," "CSP," "CORS," "SSRF," "SQL injection," "XSS," "CSRF," "harden," "threat model," "find security bugs," or any request to assess or improve the security posture of a Nest/Next/Postgres app — even casual ones like "look this over for holes." Prefer this over generic security advice.
---

# Security Strategy

Assess and harden the security of TypeScript applications built on NestJS, Next.js, and PostgreSQL. This skill encodes a repeatable methodology — threat-model, review against a concrete checklist, prioritize by risk, fix with copy-ready patterns — rather than a grab-bag of tips. The goal is findings a senior security engineer would sign off on: specific, exploitable-or-not assessed, and tied to a remediation.

## Operating principles

**Be a reviewer, not a rubber stamp.** "Is this secure?" is never answered "yes." Find the conditions under which it fails. If you cannot find a flaw, say what you checked and what you could not verify from the code alone (e.g. deployment config, secrets at rest).

**Prioritize by exploitability × impact, not by checklist position.** A reachable IDOR on a money endpoint outranks a missing security header. Always lead with the highest-risk finding.

**Defense in depth, but name the primary control.** RLS *and* app-layer authz is correct; but for each asset, identify the one control that must hold, so a reviewer knows where the real boundary is.

**Never trust the client, the network, or another tenant's row.** Every external input is hostile until validated at the boundary. Every cross-tenant read is a breach until proven scoped.

**Show, don't lecture.** Findings come with a minimal reproduction or the exact vulnerable line, and a concrete fixed version — not "consider validating input."

## How to use this skill

1. Establish scope and trust boundaries: what's being reviewed (an endpoint, a feature, the whole app), who the attacker is (anonymous, authenticated user, malicious tenant, insider), and what the crown-jewel assets are.
2. Run the relevant review pass(es) using the reference files — they hold the concrete checklists, vulnerable/fixed code pairs, and rationale. Don't reconstruct these from memory.
3. Produce findings in the **standard finding format** below, ordered by severity.
4. When the user is on a specific library version or you're unsure of current advice, verify against Context7 (e.g. `/websites/nestjs`, `/owasp/*`) and the live OWASP cheat sheets rather than guessing.

## Reference files

Read the relevant file before reviewing or writing code in that area. Each contains a checklist plus vulnerable→fixed code pairs for this stack.

| File | When to read |
|------|--------------|
| `references/owasp.md` | Any general "security review / audit / is this secure" request. Maps OWASP Top 10 (2021) and API Security Top 10 (2023) to concrete NestJS/Next.js/Postgres failure modes, with detection cues. Start here for broad reviews. |
| `references/auth.md` | Authentication, sessions, JWTs, OAuth/SSO, password handling, MFA, refresh-token rotation, account enumeration, Next.js Server Action / route-handler auth, and authorization (RBAC/ABAC), IDOR/BOLA, privilege escalation. |
| `references/rls.md` | PostgreSQL Row-Level Security, multi-tenant isolation, `current_setting`-based tenant scoping, Prisma/Drizzle + RLS integration pitfalls, and how to **audit** existing RLS for bypasses (BYPASSRLS, missing `FORCE`, policy gaps). |
| `references/secrets.md` | Secret storage, env-var hygiene, key rotation, detecting committed/leaked secrets, runtime secret loading, CI/CD secret exposure, and what counts as a secret that must never reach the client bundle. |
| `references/bug-finder.md` | Systematic source-code vulnerability hunting: injection (SQLi/NoSQLi/command), SSRF, XSS, CSRF, prototype pollution, insecure deserialization, path traversal, ReDoS, race conditions, and the grep/AST patterns and tooling (Semgrep, CodeQL, `npm audit`, Snyk) to find them at scale. |

## Standard finding format

ALWAYS report each finding using this exact structure so results are scannable and actionable:

```
### [SEVERITY] Short title  (e.g. [HIGH] IDOR on GET /invoices/:id)
**Where:** file:line or endpoint/component
**Category:** OWASP A01 / API1:2023 / CWE-639 (use the closest standard ID)
**What:** one-sentence description of the flaw
**Impact:** what an attacker achieves, and as which actor
**Proof:** the vulnerable line, or a minimal request/repro
**Fix:** the corrected code or control, copy-ready
**Residual risk / notes:** anything the code alone can't confirm
```

Severity uses CVSS-aligned bands: **CRITICAL** (trivial unauth RCE / full data breach), **HIGH** (auth'd privilege escalation, cross-tenant data access, injection), **MEDIUM** (info leak, weak crypto, missing hardening with a real path to harm), **LOW** (defense-in-depth gap, hardening), **INFO** (note, no direct risk). When unsure between two bands, pick the higher and justify.

For a full audit, end with a short **summary table** (severity counts) and a **top-3 fix-first** list ordered by risk-reduction-per-effort.

## Core conventions (apply to every review)

**Trust boundaries first.** Before reading any code, draw the boundaries: client ↔ Next.js, Next.js server ↔ NestJS API, API ↔ Postgres, app ↔ third parties. Most real bugs live where data crosses a boundary without revalidation — e.g. trusting a Next.js client component's claim of `userId`, or an API trusting a JWT claim it never verifies server-side.

**Authorization is checked server-side, per-object, on every request.** Authentication (who you are) ≠ authorization (what you may touch). The single most common high-severity bug in this stack is IDOR/BOLA: an authenticated user passing someone else's resource id. Every fetch-by-id must filter by owner/tenant in the same query, not after. See `references/auth.md`.

**Tenant isolation has a database-level backstop.** App-layer `where: { tenantId }` filters are necessary but forgettable. For multi-tenant data, Postgres RLS is the control that holds when an app query forgets the filter. Audit that RLS is `ENABLE`d *and* `FORCE`d, that the connection role isn't `BYPASSRLS`/superuser, and that tenant context is set per-transaction, not per-pool. See `references/rls.md`.

**Validate and parameterize at the boundary.** Every external input passes a schema (class-validator DTO in Nest, Zod in Next.js) with allow-listing. Every query is parameterized — Prisma/Drizzle builders by default, and `$queryRaw`/`sql` only with tagged-template parameters, never string concatenation. See `references/bug-finder.md`.

**Secrets never reach the client and never reach git.** Anything secret loads from the environment/secret manager at runtime, is excluded from the Next.js client bundle (no secret behind `NEXT_PUBLIC_`), and is scanned for in history. See `references/secrets.md`.

**Fail closed and don't leak.** Errors return generic messages to clients while logging detail server-side; auth failures are indistinguishable (no "user not found" vs "wrong password"); and a missing authz check denies by default. See `references/owasp.md` and `references/auth.md`.

## When to defer to another skill

This is the security/review layer. For non-security implementation, hand off:
- Framework wiring (modules, guards, DTOs mechanics) → `nestjs-backend`; realtime/socket specifics → `nestjs-websocket-realtime`.
- Pure SQL performance / planner tuning → `postgresql-core`; ORM modeling → `prisma-postgresql` / `drizzle-postgresql`.
- API contract shape → `api-design-strategy`; test scaffolding → `testing-strategy`.

Pull those in for the fix's implementation details, but own the security judgment here.
