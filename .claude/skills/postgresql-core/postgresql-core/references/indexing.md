# Indexing Strategy

Choosing the right index for a workload, knowing the index types, and maintaining them.

## Contents
- The decision: which index for which query
- Index types
- Composite index column order
- Partial, covering, and expression indexes
- When indexes don't help or hurt
- Building and maintaining indexes
- Finding missing and unused indexes

## The core decision

An index trades write cost and disk for read speed. Add one when a query reads a small fraction of a large table repeatedly. Don't add one to satisfy a query that runs once a month over a small table.

To choose columns, read the query's `WHERE`, `JOIN`, `ORDER BY`, and `GROUP BY`. The index should let Postgres locate matching rows without scanning, and ideally also provide ordering so it can skip a sort.

## Index types

- **B-tree** (default) — equality and range (`=`, `<`, `>`, `BETWEEN`, `IN`), and `ORDER BY`. Covers the vast majority of needs. Also supports prefix `LIKE 'foo%'` (with the right operator class for non-C locales: `text_pattern_ops`).
- **Hash** — equality only. Rarely worth it over B-tree; B-tree handles equality fine and does more.
- **GIN** — "many values in one row": JSONB containment (`@>`), array membership, and full-text search (`tsvector`). Also trigram (`pg_trgm`) for substring/`LIKE '%mid%'` and fuzzy match. Slower to update, fast to query.
- **GiST** — geometric, range types, nearest-neighbor (`ORDER BY geom <-> point`), and exclusion constraints. PostGIS spatial indexes are GiST.
- **BRIN** — tiny index for huge tables where the column is physically correlated with row order (append-only time-series on `created_at`). Stores per-block-range min/max. Enormous space savings; only helps when data is naturally clustered.
- **SP-GiST** — partitioned search trees (e.g., non-balanced data, IP ranges).

Default to B-tree. Reach for GIN when querying inside JSONB/arrays or doing text search, BRIN for append-only time-series, GiST for spatial/range.

## Composite index column order

For a multi-column B-tree, **order matters**. The index supports:
- equality on a leading prefix of columns, then
- a range on the next column, then
- ordering from that point.

Rule of thumb: **equality columns first, then the range/sort column.** For
```sql
WHERE tenant_id = $1 AND created_at >= $2 ORDER BY created_at
```
build `(tenant_id, created_at)` — tenant_id (equality) leads, created_at (range + sort) follows. This single index satisfies the filter and the sort. The reverse `(created_at, tenant_id)` can't use tenant_id efficiently after a created_at range.

A query filtering only on the **second** column of an index generally can't use it — the leading column must be constrained (or scanned via the less efficient skip-scan in PG18+).

## Partial, covering, and expression indexes

**Partial** — index only the rows you query:
```sql
CREATE INDEX ON orders (created_at) WHERE status = 'pending';
```
Smaller, faster, cheaper to maintain. Ideal when queries always filter on a low-cardinality flag (soft-delete `WHERE deleted_at IS NULL`, active rows, a queue of unprocessed items).

**Covering** — include non-key columns so the query is answered index-only:
```sql
CREATE INDEX ON orders (customer_id) INCLUDE (total, status);
```
A query selecting only `customer_id, total, status` filtered by `customer_id` becomes an Index Only Scan — no heap fetch. `INCLUDE` columns aren't part of the search key (can't be used in WHERE matching), just along for the ride.

**Expression** — index a computed value so a transformed predicate is sargable:
```sql
CREATE INDEX ON users (lower(email));   -- enables WHERE lower(email) = $1
```
The query must use the exact expression for the index to apply.

## When indexes don't help — or hurt

- **They slow every write.** Each INSERT/UPDATE/DELETE maintains every index on the table. A table with 12 indexes pays 12× index-maintenance on writes. Audit and drop unused ones.
- **HOT updates are defeated by indexes on the updated column.** If an UPDATE changes only un-indexed columns and the new tuple fits on the same page, Postgres does a "Heap-Only Tuple" update that skips index maintenance. Indexing a frequently-updated column forfeits this.
- **Low selectivity = no benefit.** Indexing a boolean or a column where one value dominates won't help full scans; a partial index on the rare value might.
- **Too many single-column indexes.** Postgres can combine them via bitmap, but a single well-ordered composite usually beats three separate indexes for a multi-column predicate.

## Building and maintaining

- **Build without locking writes:** `CREATE INDEX CONCURRENTLY`. It takes longer and can't run in a transaction block, but doesn't hold a write lock. Essential in production. If it fails it leaves an `INVALID` index — drop and retry.
- **Rebuild a bloated index:** `REINDEX INDEX CONCURRENTLY name;` (PG12+). Index bloat accumulates from updates/deletes just like table bloat.
- **Replace an index without a gap:** create the new one CONCURRENTLY, then drop the old.

## Finding missing and unused indexes

**Unused indexes** (candidates to drop):
```sql
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelid NOT IN (SELECT conindid FROM pg_constraint)
ORDER BY pg_relation_size(indexrelid) DESC;
```
(Don't drop indexes backing unique/PK constraints, and check over a representative time window — a monthly report's index looks unused on a Tuesday.)

**Tables taking lots of sequential scans** (candidates for a new index):
```sql
SELECT relname, seq_scan, seq_tup_read, idx_scan,
       seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC LIMIT 20;
```
High `seq_tup_read` with high `seq_scan` on a big table is a strong signal a query needs an index.

## Tradeoff summary

State this when recommending an index: it speeds the target reads, costs disk, and adds maintenance to every write on the table. For a write-heavy table, prefer a partial or covering index that does the most for the fewest bytes, and drop anything `pg_stat_user_indexes` shows as unused.
