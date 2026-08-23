# Replication & Read Replicas

Streaming vs logical replication, scaling reads, lag, and failover.

## Contents
- The two replication mechanisms
- Streaming (physical) replication
- Logical replication
- Scaling reads with replicas
- Replica lag and read-your-writes
- Failover and high availability

## The two mechanisms

PostgreSQL has two native replication systems, for different purposes:

- **Streaming (physical) replication** — ships the WAL (write-ahead log) byte-for-byte to standbys, which replay it to stay an exact block-level copy of the primary. Whole-cluster, all-or-nothing, same major version. Used for read replicas and high-availability standbys.
- **Logical replication** — decodes WAL into row-level change events (INSERT/UPDATE/DELETE) and publishes them per-table. Selective, cross-version capable, target can have extra tables/indexes and accept its own writes. Used for migrations, selective sync, and integrating with other systems.

Choose streaming for "I want a hot copy / read replica / failover target." Choose logical for "I want some tables, across versions, possibly transformed, possibly into a different schema."

## Streaming (physical) replication

- The standby connects to the primary, receives WAL, and replays it continuously. It's **read-only** (a "hot standby") and can serve `SELECT`s.
- **Synchronous vs asynchronous:**
  - *Asynchronous* (default) — the primary commits without waiting for the standby. Fast, but a primary crash can lose the last few transactions not yet shipped. Replicas lag behind by a small, variable amount.
  - *Synchronous* (`synchronous_commit = on` + `synchronous_standby_names`) — the primary waits for the standby to confirm before acknowledging commit. Zero data loss on failover, at the cost of commit latency tied to the standby. Use for data you cannot lose; understand that a stalled standby can stall the primary's commits.
- **Replication slots** guarantee the primary retains WAL the standby still needs, preventing "the standby fell too far behind and the WAL it needs was already recycled." The tradeoff: a disconnected standby with a slot causes WAL to accumulate on the primary and can fill its disk. Monitor slot lag and set `max_slot_wal_keep_size` to cap retention.

## Logical replication

- Set up with `CREATE PUBLICATION` on the source and `CREATE SUBSCRIPTION` on the target.
- Works across major versions → the standard tool for **near-zero-downtime major-version upgrades**: replicate old→new logically, let the new catch up, then cut over.
- Replicates DML row changes. **It does not replicate DDL** — schema changes (new columns, etc.) must be applied to both sides manually/in order, or replication breaks.
- Each table needs a **replica identity** so updates/deletes can be matched on the target: a primary key by default, otherwise `REPLICA IDENTITY FULL` (logs the whole old row — heavier).
- Sequences are not advanced on the subscriber automatically; handle them at cutover.

## Scaling reads with replicas

The pattern: send writes to the primary, route read-only queries to one or more streaming standbys, spreading read load. This works well for read-heavy workloads (dashboards, analytics, content serving).

Routing is an **application/proxy concern**, not something Postgres does for you. Options: route in the app (a "read" connection vs "write" connection), or use a proxy (PgBouncer doesn't route by query type; tools like Pgpool-II or app-level logic do). Be explicit about which queries are safe to send to a possibly-stale replica.

What replicas **don't** solve: write scaling. Every replica replays every write the primary does, so they don't reduce write load — they only spread reads. If writes are the bottleneck, look at partitioning, batching, or sharding, not replicas.

## Replica lag and read-your-writes

A streaming replica is slightly behind the primary (async) — typically milliseconds, but seconds or more under load or long transactions. This creates the **read-your-writes** hazard: a user writes (to the primary), is immediately redirected to a query served by a lagging replica, and doesn't see their own change. Plan for it:

- Route reads that must reflect a just-made write back to the primary (e.g., "after creating, read from primary for N seconds" or per-session pinning).
- Monitor lag and route away from replicas that exceed a threshold:
  ```sql
  -- On the replica: how far behind in time
  SELECT now() - pg_last_xact_replay_timestamp() AS replication_delay;
  ```
  ```sql
  -- On the primary: per-standby byte lag
  SELECT client_addr, state,
         pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS replay_lag_bytes
  FROM pg_stat_replication;
  ```
- Long-running queries on a replica can be cancelled by replay conflicts (`hot_standby_feedback = on` mitigates by telling the primary not to vacuum away rows the replica still reads — at the cost of some bloat on the primary).

## Failover and high availability

Native streaming replication gives you standbys, but **promotion and client redirection are not automatic.** For real HA you need an orchestrator:

- **Patroni** (with etcd/Consul/ZooKeeper) — the common open-source choice; handles leader election, automatic failover, and exposes the current primary via a known endpoint.
- **repmgr**, **pg_auto_failover** — alternatives.
- Managed Postgres services build this in (you get an endpoint that follows the primary).

Promotion makes a standby the new primary; the old primary, when it returns, must be re-cloned or rejoined (e.g., `pg_rewind`) as a standby — it can't just resume as primary without risking split-brain. Always front the cluster with a stable endpoint (virtual IP, DNS, or the orchestrator's) so clients don't hardcode a host that might get demoted.

## Summary

Use **streaming replication** for read replicas and HA standbys; pick **synchronous** only for can't-lose-it data. Use **logical replication** for selective sync and cross-version migration/upgrades. Replicas scale reads, not writes, and always lag — design the app for read-your-writes. For automatic failover, add Patroni or use a managed service; never rely on manual promotion alone.
