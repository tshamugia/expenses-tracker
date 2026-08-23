# MVCC, VACUUM & Maintenance

How Postgres's concurrency model creates dead rows, and how to keep the cluster healthy.

## Contents
- MVCC in one paragraph
- Dead tuples and bloat
- VACUUM, autovacuum, and tuning
- Transaction ID wraparound
- Index bloat and reindexing
- Diagnosing bloat

## MVCC in one paragraph

PostgreSQL uses Multi-Version Concurrency Control: readers never block writers and writers never block readers, because an `UPDATE` doesn't overwrite a row — it writes a **new row version** and marks the old one dead; a `DELETE` just marks the row dead. Each transaction sees the versions valid as of its snapshot. This is why Postgres has excellent read/write concurrency — and also why it accumulates **dead tuples** that must be cleaned up. Understanding this explains most of Postgres's maintenance behavior.

## Dead tuples and bloat

Every UPDATE and DELETE leaves a dead tuple occupying space until vacuum reclaims it. **Bloat** is accumulated dead space: a table (and its indexes) physically larger than the live data warrants. Symptoms: disk usage climbing without proportional data growth, queries getting slower over time (more pages to scan for the same live rows), index scans touching dead entries.

Heavy-update/delete workloads (queues, counters, status-flag churn, frequent upserts) bloat fastest. A table that's only ever inserted into and read barely bloats.

## VACUUM and autovacuum

`VACUUM` marks dead tuple space reusable (and updates the visibility map enabling index-only scans). It does **not** normally return space to the OS — the file stays the same size but the freed space is reused by future inserts. That's fine and intended.

- **Autovacuum** runs this automatically, triggered per-table when dead tuples exceed a threshold:
  `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × reltuples`.
  Default scale factor 0.2 means a table is vacuumed after ~20% of its rows are dead — far too lazy for a large, hot table (20% of 100M rows = 20M dead tuples before it acts). **Lower the scale factor per-table for big/hot tables:**
  ```sql
  ALTER TABLE hot_table SET (autovacuum_vacuum_scale_factor = 0.02,
                             autovacuum_vacuum_threshold = 1000);
  ```
- **`VACUUM FULL`** rewrites the table compactly and *does* return space to the OS — but takes an **`ACCESS EXCLUSIVE` lock** (blocks all reads and writes) and needs free disk for the rewrite. Use it only to recover from serious one-off bloat, in a maintenance window. For online compaction prefer `pg_repack` (rebuilds without the long exclusive lock).
- **`ANALYZE`** (also run by autovacuum) refreshes planner statistics. Stale stats → bad plans; this is a common cause of a query suddenly going slow after a big data change.

Autovacuum tuning levers when it can't keep up: raise `autovacuum_max_workers`, raise `autovacuum_vacuum_cost_limit` (lets each run do more work before pausing), and lower per-table scale factors on the hottest tables. If autovacuum is falling behind, dead tuples and bloat grow unbounded — monitor it.

## Transaction ID wraparound

Postgres tracks row visibility with 32-bit transaction IDs that eventually wrap around. To prevent data corruption, vacuum must "freeze" old rows before the ID space exhausts. If autovacuum is disabled or perpetually behind, the database will issue increasingly urgent warnings and ultimately **shut down writes** to protect itself (`database is not accepting commands to avoid wraparound data loss`).

This is rare with healthy autovacuum but catastrophic when it happens. Monitor age:
```sql
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database ORDER BY xid_age DESC;
```
A value approaching `autovacuum_freeze_max_age` (default 200M) means freeze vacuums are overdue. The fix is always: let vacuum run / make it run faster — never disable autovacuum on a write-active database.

## Index bloat and reindexing

Indexes bloat too, from the same dead-tuple churn. A bloated index is bigger and slower. Rebuild online:
```sql
REINDEX INDEX CONCURRENTLY idx_name;   -- PG12+, no long write lock
REINDEX TABLE CONCURRENTLY tbl;        -- all indexes on a table
```
B-tree indexes on monotonically-increasing keys (timestamps, identities) with deletes of old rows are especially prone to one-sided bloat.

## Diagnosing bloat

Quick dead-tuple check (the practical first look):
```sql
SELECT relname,
       n_live_tup, n_dead_tup,
       round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```
High `dead_pct` with an old or null `last_autovacuum` means autovacuum isn't keeping up on that table → tune its scale factor. For precise table/index byte-level bloat estimates, use the `pgstattuple` extension (`SELECT * FROM pgstattuple('tbl');`) or the well-known community bloat-estimate queries.

Also watch for what **blocks** vacuum from cleaning: a long-running transaction or an idle-in-transaction session holds back the "oldest snapshot," so vacuum can't remove tuples newer than it — bloat grows cluster-wide. Check:
```sql
SELECT pid, state, now() - xact_start AS xact_age, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_age DESC NULLS LAST LIMIT 10;
```
Long-open transactions are a leading cause of "vacuum runs but bloat won't go down."

## Summary

MVCC makes every UPDATE/DELETE leave dead tuples; autovacuum reclaims them but its 0.2 default scale factor is too lazy for large hot tables — **lower it per-table**. Use `VACUUM FULL`/`pg_repack` only for serious one-off bloat, keep `ANALYZE` current for good plans, never disable autovacuum (wraparound risk), reindex concurrently to clear index bloat, and hunt long-running/idle-in-transaction sessions that hold vacuum back.
