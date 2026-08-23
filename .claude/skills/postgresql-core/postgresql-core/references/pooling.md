# Connection Pooling

Why Postgres connections are expensive, how to size a pool, and how to deploy PgBouncer.

## Contents
- Why pooling matters
- Pool sizing math
- PgBouncer pool modes
- Deployment topology
- Common failure modes

## Why pooling matters

Each PostgreSQL connection is a **separate OS process** with its own memory (work_mem allocations, catalog caches, etc.) — roughly several MB of overhead each, plus context-switching cost. Postgres is not designed for thousands of concurrent connections. Past a point (often a few hundred), more connections *reduce* throughput because the CPUs spend time scheduling and contending on internal locks rather than doing work.

The symptom users hit: bumping `max_connections` to "fix" connection errors, then watching performance degrade. The right answer is almost always a pooler that multiplexes many client connections onto a small number of real server connections.

**`max_connections` is not a capacity dial — it's a safety limit.** Raising it lets more clients connect but doesn't give the server more capacity to do work; it just lets you overload it. Keep it modest (e.g., 100–200) and put a pooler in front.

## Pool sizing math

The counterintuitive result: the optimal number of *active* database connections is small, often close to the number of CPU cores. A widely-used starting formula:

```
connections ≈ (core_count × 2) + effective_spindle_count
```

For an 8-core server on SSD, that's roughly **17–20 active connections**, not hundreds. More connections than the server can run in parallel just queue. It is genuinely faster to have 20 connections each finishing quickly than 200 connections all crawling.

This means: a pool of ~20–50 server connections can serve thousands of application clients, because at any instant only a handful are mid-query. Size the pool to what the database can usefully run concurrently, and let the pooler queue the rest for milliseconds.

If your app has multiple instances, the *total* server connections across all PgBouncer/pool instances must stay under the budget. Ten app instances each with a 20-connection pool = 200 server connections — plan the math across the fleet.

## PgBouncer pool modes

PgBouncer is the standard lightweight pooler. The mode determines how aggressively it reuses server connections:

- **Session pooling** — a server connection is assigned to a client for the whole session, returned on disconnect. Safest (everything works) but barely better than no pooling for connection count. Use only if the app relies on session state.
- **Transaction pooling** — a server connection is assigned only for the duration of a transaction, then returned to the pool. **This is the high-leverage mode** — it's what lets a tiny pool serve huge client counts. The catch: anything that spans transactions breaks. No session-level `SET`, no `LISTEN/NOTIFY`, no session-scoped prepared statements (unless using PgBouncer 1.21+ prepared-statement support), no advisory locks held across transactions, no `WITH HOLD` cursors. Apps must not depend on session state.
- **Statement pooling** — returns the connection after each statement; forbids multi-statement transactions. Rarely appropriate.

Default recommendation: **transaction pooling**, and make sure the app doesn't use cross-transaction session state. If using server-side prepared statements through PgBouncer, ensure version 1.21+ with `max_prepared_statements` configured.

## Deployment topology

Two common placements:
- **Pooler beside the database** (one PgBouncer per DB host or as a sidecar) — centralizes the connection budget; every app instance connects through it. Simplest to reason about the total connection count.
- **Pooler beside the app** (sidecar per app instance) — lower latency hop, but you must sum pools across instances to stay under budget.

For managed/serverless Postgres or serverless app runtimes (where each function invocation may open a connection), a transaction-mode pooler is effectively mandatory — serverless concurrency will otherwise exhaust connections instantly. Several managed providers ship a built-in pooler endpoint; prefer it.

Application-side pools (HikariCP, node-pg `Pool`, etc.) and PgBouncer are complementary: the app pool reuses connections within a process; PgBouncer multiplexes across processes. With PgBouncer in transaction mode, keep the app-side pool modest — it no longer needs to be large.

## Common failure modes

- **"FATAL: remaining connection slots are reserved for non-replication superuser connections"** — you've hit `max_connections`. Add a pooler; don't just raise the limit.
- **"FATAL: sorry, too many clients already"** — same root cause.
- **Mysterious `SET` / prepared-statement errors after adding PgBouncer** — transaction pooling broke session-state assumptions. Either move the state into each transaction, switch that path to session pooling, or upgrade PgBouncer for prepared-statement support.
- **Pool exhaustion under load with connections "idle in transaction"** — the app is holding transactions open (e.g., doing slow work or external calls mid-transaction). Connections stay checked out and the pool starves. Fix the app to keep transactions short; monitor with:
  ```sql
  SELECT pid, state, now() - state_change AS idle_for, query
  FROM pg_stat_activity
  WHERE state = 'idle in transaction'
  ORDER BY idle_for DESC;
  ```
  Set `idle_in_transaction_session_timeout` as a backstop so a leaked transaction can't pin a connection forever.

## Summary recommendation

Keep `max_connections` modest, put PgBouncer in transaction mode in front, size the server-connection pool near `(cores × 2)` and sum it across all app/pooler instances, and ensure the application holds no cross-transaction session state and keeps transactions short.
