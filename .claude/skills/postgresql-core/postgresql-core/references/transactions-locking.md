# Transactions, Isolation & Locking

Isolation levels, lock types, deadlocks, and concurrency-safe patterns.

## Contents
- Isolation levels
- Anomalies each level prevents
- Row and table locks
- Explicit locking patterns
- Deadlocks
- Advisory locks
- Concurrency-safe patterns

## Isolation levels

Postgres implements three of the four SQL isolation levels (its `READ UNCOMMITTED` behaves as `READ COMMITTED` — there are no dirty reads ever).

- **READ COMMITTED** (default) — each statement sees data committed before that statement began. Within one transaction, two identical `SELECT`s can return different results if another transaction committed in between. Sufficient for most OLTP.
- **REPEATABLE READ** — the transaction sees a single snapshot taken at its start; all reads are consistent for its whole duration. Prevents non-repeatable and phantom reads. In Postgres this is implemented as snapshot isolation. A write conflict raises a serialization error you must retry.
- **SERIALIZABLE** — as if transactions ran one at a time. Uses Serializable Snapshot Isolation (SSI) to detect dependency cycles and aborts one transaction with a serialization failure. The only level that prevents *all* anomalies including write skew. Requires the application to **retry** transactions that fail with `40001`.

Set per-transaction: `BEGIN ISOLATION LEVEL SERIALIZABLE;` (or set the default). Higher levels cost more conflict-detection and more retries; use the lowest level that's correct for the invariant you're protecting.

## Anomalies by level

| Anomaly | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
|---|---|---|---|
| Dirty read | prevented | prevented | prevented |
| Non-repeatable read | possible | prevented | prevented |
| Phantom read | possible | prevented | prevented |
| Write skew | possible | possible | prevented |

**Write skew** is the subtle one: two transactions each read a state, each makes a decision that's individually valid, and together they violate an invariant (classic: two on-call doctors each see "another is on call" and both go off duty). Only SERIALIZABLE catches it; under lower levels you must enforce the invariant with explicit locking or a constraint.

## Row and table locks

- **Row locks** are taken by `UPDATE`/`DELETE` and explicit `SELECT ... FOR UPDATE`. Other transactions block trying to write the same row but reads (MVCC) proceed.
- **Table locks** range from `ACCESS SHARE` (taken by `SELECT`) up to `ACCESS EXCLUSIVE` (taken by `DROP`, `TRUNCATE`, most `ALTER TABLE`, `VACUUM FULL`) which blocks everything. DDL on a busy table is dangerous precisely because of this — see migrations note below.
- Lock modes conflict per a matrix; the practical takeaway: ordinary reads/writes coexist, but schema changes and `VACUUM FULL` can block the whole table.

## Explicit locking patterns

- **`SELECT ... FOR UPDATE`** — lock the rows you're about to modify so a concurrent transaction can't change them under you (read-modify-write safety). Holds until commit.
- **`SELECT ... FOR UPDATE SKIP LOCKED`** — the **job-queue pattern**: each worker grabs unlocked rows and skips ones another worker already locked, so N workers pull disjoint work without blocking each other:
  ```sql
  SELECT id FROM jobs WHERE status = 'pending'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED LIMIT 10;
  ```
- **`FOR UPDATE NOWAIT`** — fail immediately instead of waiting, when you'd rather error than block.
- **`FOR SHARE`** — lock against modification but allow other sharers (e.g., ensure a referenced row can't be deleted while you depend on it).

## Deadlocks

A deadlock is two transactions each holding a lock the other needs. Postgres detects the cycle and aborts one with `deadlock detected` (`40P01`). Prevent them by:

- **Acquiring locks in a consistent order** everywhere (e.g., always lock rows in ascending primary-key order). Most deadlocks come from two code paths locking the same rows in opposite orders.
- Keeping transactions short and touching fewer rows.
- Being ready to **retry** the aborted transaction — deadlock aborts are expected under contention, not bugs to eliminate entirely.

Inspect what's waiting:
```sql
SELECT pid, wait_event_type, wait_event, state,
       now() - query_start AS running_for, query
FROM pg_stat_activity
WHERE wait_event_type = 'Lock';
```

## Advisory locks

Application-defined locks not tied to any row, for coordinating logic across sessions (e.g., "only one worker runs this cron"):
```sql
SELECT pg_try_advisory_lock(12345);   -- non-blocking, returns bool
-- ... do exclusive work ...
SELECT pg_advisory_unlock(12345);
```
Session-level locks persist until released/disconnect; `pg_advisory_xact_lock` auto-releases at transaction end (safer — no leak on a missed unlock). Note: advisory locks don't survive through a transaction-mode PgBouncer the way you'd expect — be careful combining them with poolers.

## Concurrency-safe patterns

- **Atomic upsert:** `INSERT ... ON CONFLICT (key) DO UPDATE ...` — race-free, no read-then-write window.
- **Atomic counter:** `UPDATE t SET n = n + 1 WHERE id = $1` (the DB serializes it) — never read-into-app-then-write-back.
- **Enforce invariants with constraints, not application checks** — a `UNIQUE` constraint or exclusion constraint holds under concurrency where an app-level "check then insert" races.
- **Migrations on live tables:** many `ALTER TABLE` forms take `ACCESS EXCLUSIVE` and block traffic. Adding a column with a non-volatile default is fast in modern PG; adding an index must use `CONCURRENTLY`; validating a new constraint can be split into `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` (the validate scans without the heavy lock). Always reason about which lock a DDL takes before running it against production.

## Summary

Default `READ COMMITTED` is right for most OLTP; step up to `SERIALIZABLE` (with retry-on-`40001`) only to guard invariants vulnerable to write skew. Use `FOR UPDATE SKIP LOCKED` for queues, lock rows in a consistent order to avoid deadlocks (and retry the ones that happen), prefer `ON CONFLICT` and in-place `SET n = n+1` for race-free writes, and enforce invariants with constraints. Treat DDL as a locking event on production tables.
