# PostgreSQL Row-Level Security & multi-tenant isolation — design and audit

RLS is the database-level backstop that holds when an application query forgets its `WHERE tenant_id = …` filter. App-layer scoping is necessary but forgettable; RLS makes cross-tenant access structurally impossible if configured correctly. This file covers both **writing** RLS and **auditing** existing RLS for the bypasses that make it a false sense of security.

## Table of contents
- The isolation model (set context per transaction)
- Writing RLS policies
- Wiring RLS with Prisma / Drizzle
- The five RLS bypasses to audit for
- Audit queries (run these against the live DB)
- Audit checklist

---

## The isolation model

The reliable pattern for a pooled app connection:
1. App authenticates the user, derives `tenant_id` from the **verified session** (never the request body).
2. At the start of each transaction, set a session variable: `SELECT set_config('app.tenant_id', $1, true)` — the `true` makes it transaction-local so it can't leak across pooled connections.
3. RLS policies compare row `tenant_id` to `current_setting('app.tenant_id')`.
4. The DB role the app connects as is **not** superuser and does **not** have `BYPASSRLS`.

The critical word is **per-transaction**. With PgBouncer or any connection pool, a `SET` (session-scoped) leaks the previous request's tenant onto the next borrower of that connection. Use `set_config(…, true)` (local) inside an explicit transaction, or `SET LOCAL`.

## Writing RLS policies

```sql
-- 1. Enable AND force (FORCE so even the table owner is subject to RLS)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

-- 2. Separate policies per command; USING filters reads/updates/deletes,
--    WITH CHECK constrains the new row on insert/update (prevents writing into another tenant)
CREATE POLICY tenant_select ON invoices FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_modify ON invoices FOR ALL
  USING       (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK  (tenant_id = current_setting('app.tenant_id')::uuid);
```
- `USING` alone does NOT stop a user from *inserting* a row with someone else's `tenant_id` — you need `WITH CHECK`. Missing `WITH CHECK` is a common, real bypass for writes.
- `current_setting('app.tenant_id')` with no second arg throws if unset → fail-closed (good). `current_setting('app.tenant_id', true)` returns NULL if unset → policy matches nothing or, worse with bad logic, everything. Prefer the throwing form so a missing context denies rather than leaks.
- `PERMISSIVE` policies (default) are OR-combined; `RESTRICTIVE` are AND-combined. Multiple permissive policies widen access — audit that the combination is what you intend.

## Wiring RLS with Prisma / Drizzle

Both ORMs pool connections, so the per-transaction context rule is essential.

```ts
// Prisma: run scoped work inside an interactive transaction that sets local context first
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  return tx.invoice.findMany() // RLS now scopes this
})
```
```ts
// Drizzle (postgres-js): same idea inside a transaction
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
  return tx.select().from(invoices)
})
```
- A bare `prisma.invoice.findMany()` outside such a transaction runs with no tenant context → if your policy uses the throwing `current_setting`, it errors (safe); if it uses the `true`/NULL form with weak logic, it may leak. Audit every query path for the context-setting wrapper.
- Prisma's migration/seed and any admin connection often use a different role — make sure that role isn't `BYPASSRLS` in production, or scope its use tightly.

## The five RLS bypasses to audit for

1. **App connects as superuser or a `BYPASSRLS` role** → RLS is silently ignored entirely. The most common "RLS is on but doesn't work" cause.
2. **`ENABLE` without `FORCE`** → the table owner (often the migration/app role) bypasses RLS.
3. **Context set per-session not per-transaction** → pooled connection leaks one tenant's context to the next request.
4. **`USING` present but `WITH CHECK` missing** → reads are scoped but a user can write rows into another tenant.
5. **Tables with RLS not enabled at all** → a new table added later without a policy; or a join/view that reads an unprotected table. Audit *every* tenant-scoped table, and views (`security_invoker` matters on PG15+).

Also: functions marked `SECURITY DEFINER` run as their owner and can bypass RLS — review them.

## Audit queries (run against the live DB)

```sql
-- Roles that bypass RLS (should NOT include the app role)
SELECT rolname FROM pg_roles WHERE rolbypassrls OR rolsuper;

-- Tenant tables and whether RLS is enabled AND forced
SELECT n.nspname, c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY rls_enabled, rls_forced;

-- Policies per table, with USING / WITH CHECK expressions (look for missing WITH CHECK)
SELECT schemaname, tablename, policyname, cmd, qual AS using_expr, with_check
FROM pg_policies ORDER BY tablename, cmd;

-- SECURITY DEFINER functions (potential bypass)
SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog');
```

To actually prove isolation, set two different tenant contexts in two transactions and confirm each sees only its rows, and that an INSERT with a foreign `tenant_id` is rejected by `WITH CHECK`.

## Audit checklist
- [ ] App role is non-superuser and not `BYPASSRLS`
- [ ] Every tenant-scoped table has RLS **ENABLEd and FORCEd**
- [ ] Policies have `WITH CHECK` on INSERT/UPDATE, not just `USING`
- [ ] Tenant context set per-**transaction** (`set_config(…, true)` / `SET LOCAL`), compatible with the pooler
- [ ] `current_setting` uses the throwing form (fail-closed) for tenant id
- [ ] No tenant table left without a policy; views use `security_invoker` where needed
- [ ] `SECURITY DEFINER` functions reviewed for bypass
- [ ] Isolation proven by a two-tenant read/write test, not assumed
