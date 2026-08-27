# Partitioning

When and how to split a large table into partitions, and the traps.

## Contents
- When partitioning helps (and when it doesn't)
- Declarative partitioning strategies
- Partition pruning
- Indexes and constraints on partitions
- Managing partitions over time
- Migration and pitfalls

## When partitioning helps

Partitioning splits one logical table into many physical child tables by a partition key. It is **not** a general speed-up for any big table — it solves specific problems:

- **Aging out data cheaply.** Dropping an old partition (`DROP TABLE`/`DETACH`) is instant and reclaims space immediately, versus a giant `DELETE` that bloats the table and hammers autovacuum. This is the single best reason to partition time-series/log data by date.
- **Pruning huge tables to a relevant slice.** If queries always filter on the partition key, the planner skips irrelevant partitions entirely.
- **Maintenance at partition granularity.** VACUUM/ANALYZE/REINDEX per partition instead of one enormous operation; bulk loads into a fresh partition.

When it **doesn't** help: a table that's merely "big" but queried by keys unrelated to a natural partition dimension. Partitioning adds planning overhead and operational complexity. If a query can't be pruned to a few partitions, it now scans many child tables — sometimes worse than one indexed table. **Don't partition under roughly tens-of-millions of rows** unless data-aging is the driver; an index usually suffices.

## Declarative partitioning strategies

Use native declarative partitioning (PG10+; mature from 11–13 onward). Three strategies:

- **RANGE** — by ordered ranges, the common case for time-series:
  ```sql
  CREATE TABLE events (id bigint, created_at timestamptz NOT NULL, ...)
    PARTITION BY RANGE (created_at);
  CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
  ```
- **LIST** — by discrete values (e.g., region, tenant tier):
  ```sql
  ... PARTITION BY LIST (region);
  CREATE TABLE events_eu PARTITION OF events FOR VALUES IN ('DE','FR','GE');
  ```
- **HASH** — even distribution when there's no natural range/list (spread write load across N partitions by `hash(key) % N`). Doesn't help pruning for range queries; used for balancing.

The **partition key must be part of the primary key / every unique constraint** — Postgres can't enforce global uniqueness across partitions on a column that isn't the partition key. This is a frequent surprise: a `users` table partitioned by `created_at` can't have a globally-unique `email` enforced by a simple unique constraint.

## Partition pruning

Pruning is the payoff: the planner eliminates partitions that can't match. It works when the query's `WHERE` constrains the **partition key** with a usable predicate. `WHERE created_at >= '2024-03-01'` prunes to recent partitions; a query with no partition-key predicate touches all of them.

- Verify pruning in `EXPLAIN` — you should see only the relevant partitions as scan nodes, not all of them.
- Pruning happens at plan time for constants and at execution time for parameters/joins (`enable_partition_pruning = on`, the default).
- Make sure queries filter on the partition key. If your access pattern doesn't naturally include it, partitioning probably isn't the right tool.

## Indexes and constraints on partitions

- An index created on the **parent** (`CREATE INDEX ON events (...)`) automatically propagates to all current and future partitions — define indexes once on the parent.
- Each partition is a real table and is indexed/vacuumed independently under the hood.
- Foreign keys: a partitioned table can have FKs (and be referenced by them in modern versions), but check version support for your exact case.

## Managing partitions over time

The operational burden is **creating future partitions and dropping old ones**. A RANGE-by-month table needs next month's partition to exist before rows arrive (inserts with no matching partition fail unless a `DEFAULT` partition exists — and a default partition hurts pruning, so avoid relying on it).

Automate it:
- **pg_partman** — the standard extension; auto-creates upcoming partitions and retires old ones on a retention policy.
- Or a scheduled job (`pg_cron`, external scheduler) that runs the `CREATE TABLE ... PARTITION OF` / `DETACH`+`DROP` DDL.

Aging out: `ALTER TABLE events DETACH PARTITION events_2023_01;` then `DROP TABLE` — instant reclaim, no bloat.

## Migration and pitfalls

- **Converting an existing big table** to partitioned isn't in-place: create the partitioned parent, create partitions, copy data in (often via `INSERT ... SELECT` in batches or attach existing tables as partitions), then swap names. Plan downtime or use a careful online approach.
- **Attaching an existing table** as a partition (`ATTACH PARTITION`) scans it to validate the partition constraint unless a matching `CHECK` already proves the bound — add that CHECK first to skip the scan-lock.
- **Cross-partition queries with no pruning** scan every partition; watch for unintentionally key-less queries after partitioning.
- **Too many partitions** (thousands) raises planning time and memory; keep the count reasonable (monthly, not hourly, unless volume truly demands it).

## Summary

Partition primarily to **age out data cheaply** and to **prune queries that filter on the partition key** — usually RANGE by date on time-series/log tables beyond tens of millions of rows. Include the partition key in every unique constraint, define indexes on the parent, automate partition creation/retention (pg_partman), and confirm pruning in `EXPLAIN`. Don't partition a merely-large table whose queries can't be pruned — index it instead.
