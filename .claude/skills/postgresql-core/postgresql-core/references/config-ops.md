# Configuration & Operations

The settings that actually matter, plus monitoring and backup essentials.

## Contents
- Memory settings
- WAL and checkpoints
- Planner cost settings
- Autovacuum (pointer)
- Monitoring: pg_stat_statements and friends
- Backups and PITR
- A starting-point config

## Memory settings

These four account for most memory-related tuning. Defaults are conservative (sized for tiny machines); on a dedicated server they're almost always too low.

- **`shared_buffers`** — Postgres's own page cache. Start at **~25% of RAM** on a dedicated DB host (the OS cache holds the rest, and Postgres relies on both). Going much higher rarely helps and can hurt; 25% is the durable rule of thumb.
- **`work_mem`** — memory **per sort/hash operation, per connection**. This is the dangerous one: a single complex query can use several × `work_mem` (multiple sorts/hashes), and that multiplies across all active connections. Set it modestly globally (e.g., a few MB to tens of MB) and raise it **per-session** for known heavy reporting queries (`SET work_mem = '256MB';`). Too low → sorts/hashes spill to disk (you'll see this in `EXPLAIN`); too high × many connections → OOM.
- **`effective_cache_size`** — not an allocation, just a **hint** to the planner about total cache available (Postgres + OS). Set to **~50–75% of RAM**. Higher values make the planner more willing to use indexes (it assumes index pages are likely cached).
- **`maintenance_work_mem`** — memory for `CREATE INDEX`, `VACUUM`, etc. Raise it (hundreds of MB to a few GB) to make index builds and vacuums faster; it's used by few concurrent operations so it's safer to set high than `work_mem`.

The interaction to remember: **`work_mem` is multiplied by connections × operations.** This is *the* reason to pool connections (see pooling.md) — fewer connections means you can afford more `work_mem` each.

## WAL and checkpoints

The write-ahead log durably records changes before they hit data files.

- **`max_wal_size`** / `min_wal_size` — let WAL grow between checkpoints. Too-frequent checkpoints (small `max_wal_size`) cause I/O spikes and write amplification. Raise `max_wal_size` (several GB on a busy write workload) to spread checkpoints out.
- **`checkpoint_completion_target`** — keep near `0.9` so checkpoint writes are spread over the interval rather than spiking.
- **`wal_compression = on`** can reduce WAL volume (and thus replication/backup load) at some CPU cost.
- **`synchronous_commit`** — `on` (default) waits for WAL flush for durability. Setting it `off` makes commits faster but risks losing the last fraction of a second of transactions on crash — acceptable only for data you can afford to lose. (Distinct from synchronous *replication*; see replication.md.)

## Planner cost settings

- **`random_page_cost`** — the planner's assumed cost of a random page read vs sequential (default 4.0, tuned for spinning disks). On **SSD/NVMe set it to ~1.1**. The default makes the planner over-favor sequential scans and under-use indexes on fast storage; lowering it on SSD is one of the highest-value one-line changes.
- **`effective_io_concurrency`** — raise on SSD/NVMe (e.g., 200) to let bitmap heap scans prefetch.
- **`cpu_*` costs** — rarely need touching.

## Autovacuum

Critical, covered in depth in `maintenance-mvcc.md`. The operational headline: the default `autovacuum_vacuum_scale_factor = 0.2` is too lazy for large hot tables — lower it per-table — and never disable autovacuum (transaction-ID wraparound risk).

## Monitoring

**`pg_stat_statements`** is the single most valuable monitoring extension — enable it everywhere. It aggregates execution stats per normalized query so you can find what actually consumes the database:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- needs shared_preload_libraries
```
```sql
-- Biggest cumulative time sinks (where to optimize first)
SELECT query, calls, total_exec_time, mean_exec_time, rows,
       100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) AS cache_hit_pct
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```
Optimize by **total** time (calls × mean), not just the slowest single query — a 5ms query run a million times costs more than a 2s query run twice.

Other essential views:
- **`pg_stat_activity`** — live sessions, what they're running, what they're waiting on. First stop for "something is stuck."
- **`pg_stat_user_tables`** / `pg_stat_user_indexes` — seq vs index scans, dead tuples, last vacuum (see indexing.md, maintenance-mvcc.md).
- **`pg_stat_replication`** — standby lag (see replication.md).
- **Cache hit ratio** — `shared_blks_hit / (hit + read)`; a healthy OLTP database is usually 95%+. Persistently low means undersized `shared_buffers` or a working set too big for RAM.

## Backups and PITR

- **`pg_dump` / `pg_dumpall`** — logical backups: portable, restore into a different version/host, per-database or per-table granularity, but slow to restore for large databases and not point-in-time. Good for small/medium DBs and migrations.
- **Physical base backup + WAL archiving** (`pg_basebackup` + continuous archiving / a tool like **pgBackRest** or **WAL-G**) — enables **Point-In-Time Recovery**: restore to any moment by replaying archived WAL up to a target time. The right approach for production: fast restore, minimal data loss, can recover from "someone dropped a table at 14:32" by recovering to 14:31.
- **Test restores.** An untested backup is a hope, not a backup. Periodically restore to a scratch host and verify.
- A read replica is **not** a backup — it faithfully replicates mistakes (a `DELETE` on the primary replicates instantly). Keep real backups regardless of replication.

## A starting-point config (dedicated host, adjust to your hardware)

For a server with, say, 32 GB RAM on SSD — these are sane starting points, not gospel; measure and adjust:
```
shared_buffers = 8GB                  # ~25% RAM
effective_cache_size = 24GB           # ~75% RAM
maintenance_work_mem = 2GB
work_mem = 32MB                       # per-op; raise per-session for reports
random_page_cost = 1.1                # SSD/NVMe
effective_io_concurrency = 200        # SSD/NVMe
max_wal_size = 8GB
checkpoint_completion_target = 0.9
max_connections = 100                 # keep modest; pool in front
```
Tools like PGTune generate a baseline from RAM/CPU/workload; treat its output as a starting point, then validate against `pg_stat_statements`, cache-hit ratio, and `EXPLAIN` on real queries.

## Summary

Set `shared_buffers` ~25% RAM and `effective_cache_size` ~75%; keep `work_mem` modest because it multiplies across connections (raise per-session for reports); on SSD set `random_page_cost ≈ 1.1`; spread checkpoints with a larger `max_wal_size`. Enable `pg_stat_statements` and optimize by total time, watch cache-hit ratio and `pg_stat_activity`, and run **tested** physical backups with WAL archiving for PITR — a replica is not a backup.
