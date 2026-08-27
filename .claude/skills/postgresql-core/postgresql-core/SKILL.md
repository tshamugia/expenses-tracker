---
name: postgresql-core
description: Expert PostgreSQL engine guidance, ORM-agnostic. Use whenever the user designs, diagnoses, or tunes a PostgreSQL database at the SQL/engine layer — schema and data-type design, indexing (B-tree, partial, composite, covering, GIN/GiST/BRIN), query optimization and reading EXPLAIN ANALYZE, joins, connection pooling (PgBouncer, pool sizing), replication and read replicas, partitioning, MVCC/vacuum/bloat, transaction isolation and locking, config tuning, monitoring, and backups. Triggers on "Postgres," "EXPLAIN," "query is slow," "add an index," "which index," "seq scan," "connection pool," "PgBouncer," "max_connections," "read replica," "replication," "partition the table," "table bloat," "VACUUM," "deadlock," "isolation level," "pg_stat_statements," "shared_buffers," "work_mem," "WAL," or any request to make Postgres faster or more reliable at the engine level. Use even with an ORM present — for raw SQL, planner behavior, and DBA concerns prefer this over the ORM skills (prisma-postgresql, drizzle-postgresql).
---

# PostgreSQL Core

Expert PostgreSQL guidance at the **engine and SQL layer**, ORM-agnostic. This skill is for the database itself: how the planner thinks, how to index for a workload, how to pool connections, how to replicate and scale reads, and how to keep a production cluster healthy.

## Scope and boundaries

Use this skill for engine-level work. If the user is writing `db.query(...)`, `pgTable`, Prisma schema models, or migration files, that's the **application/ORM layer** — defer to `drizzle-postgresql` or `prisma-postgresql`. The dividing line: this skill is what you'd tell a DBA; the ORM skills are what you'd tell an app developer. They compose — an ORM emits SQL that this skill helps you read, index, and tune.

Assume PostgreSQL 16+ unless the user states otherwise. Most guidance holds from 12+; version-specific features are flagged inline.

## Operating principle: measure, don't guess

The single most common mistake is tuning by intuition. PostgreSQL ships rich introspection — use it before changing anything.

1. **Reproduce the problem with real numbers.** For a slow query, run `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>`. Never reason about a plan you haven't seen.
2. **Find the actual hot spots.** Enable and query `pg_stat_statements` to rank queries by total time, not anecdote.
3. **Change one thing, re-measure.** Index, config, or query rewrite — isolate the variable.

When the user shows you a slow query without a plan, your first move is almost always to ask for (or write) the `EXPLAIN (ANALYZE, BUFFERS)` output.

## How to route within this skill

Read the relevant reference file(s) before giving detailed advice — they contain the depth, the gotchas, and the copy-pasteable diagnostics. Load only what the task needs:

| If the task is about… | Read |
|---|---|
| Why a query is slow, reading a plan, join algorithms, planner behavior | `references/query-performance.md` |
| Which index to add, index types, when indexes don't help, maintenance | `references/indexing.md` |
| Connection limits, PgBouncer, pool sizing math, "too many clients" | `references/pooling.md` |
| Read replicas, streaming/logical replication, failover, replica lag | `references/replication.md` |
| Schema design, data types, constraints, normalization tradeoffs | `references/schema-design.md` |
| Partitioning a large table, declarative partitioning, pruning | `references/partitioning.md` |
| VACUUM, bloat, autovacuum tuning, transaction ID wraparound, MVCC | `references/maintenance-mvcc.md` |
| Isolation levels, locks, deadlocks, `SELECT FOR UPDATE`, advisory locks | `references/transactions-locking.md` |
| `postgresql.conf` tuning, `shared_buffers`/`work_mem`/WAL, monitoring | `references/config-ops.md` |

Most real questions touch two or three of these. A "my query is slow" report usually pulls in query-performance + indexing; a "we're hitting connection limits under load" pulls in pooling + config-ops.

## Quick diagnostic playbook

Reach for these immediately when a user describes a symptom; the reference files explain each in depth.

**"A query is slow"**
```sql
EXPLAIN (ANALYZE, BUFFERS) <the query>;
```
Look for: `Seq Scan` on a large table, a row-estimate that's wildly off the actual count (stale stats → `ANALYZE`), nested loops over big row counts, `Sort`/`Hash` spilling to disk (`work_mem` too small), or `Rows Removed by Filter` showing a missing index. → `query-performance.md`, `indexing.md`

**"The whole database feels slow / what should I even look at"**
```sql
-- Top queries by cumulative time
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```
→ `config-ops.md`

**"Too many connections" / "remaining connection slots are reserved"**
You almost certainly need a pooler, not a higher `max_connections`. → `pooling.md`

**"Tables keep growing / disk usage is high / queries got slow over time"**
Suspect bloat from dead tuples. Check `n_dead_tup` and last autovacuum:
```sql
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 20;
```
→ `maintenance-mvcc.md`

**"Deadlock detected" / "query stuck waiting"**
```sql
SELECT pid, wait_event_type, wait_event, state, query
FROM pg_stat_activity WHERE wait_event IS NOT NULL;
```
→ `transactions-locking.md`

**"Reads are overwhelming the primary"**
Offload to read replicas, but understand replica lag and read-your-writes consequences first. → `replication.md`

## Style of advice

- **Always tie a recommendation to evidence or a clear mechanism.** "Add an index on `(tenant_id, created_at)`" lands better with "because the plan shows a seq scan filtering 2M rows down to 40, and your query filters by tenant then sorts by date."
- **State the tradeoff.** Every index slows writes; every replica adds lag; a larger `work_mem` multiplies across connections. Expert advice names the cost.
- **Prefer the simplest fix that works.** A missing index or stale stats explains more slow queries than any exotic tuning. Don't reach for partitioning or replicas when an index solves it.
- **Give runnable SQL.** Diagnostics and DDL should be copy-pasteable, with placeholders clearly marked.
