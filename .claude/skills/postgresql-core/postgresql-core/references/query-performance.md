# Query Performance & the Planner

How to read plans, understand join algorithms, and fix slow queries at the source.

## Contents
- Reading EXPLAIN output
- Scan types and what they mean
- Join algorithms
- Common plan pathologies and fixes
- Statistics and the planner
- Query rewriting techniques
- Useful planner knobs

## Reading EXPLAIN output

Always use `EXPLAIN (ANALYZE, BUFFERS)`. Plain `EXPLAIN` shows estimates; `ANALYZE` actually runs the query and shows real timing and row counts; `BUFFERS` shows page hits/reads so you can tell cache from disk.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;
```

Read plans **inside-out and bottom-up**: the most indented nodes execute first, feeding their parents. For each node note three things:

1. **Estimated vs actual rows.** `(rows=1000)` in the plan line vs `(actual rows=2000000)` after ANALYZE. A large gap means the planner is working from bad statistics and likely chose a bad plan. This is the number one thing to look for.
2. **Time.** `actual time=0.5..4200` — the second number is cumulative for that node including children. Find where the wall-clock time concentrates.
3. **Loops.** A node run inside a nested loop shows `loops=N`; per-loop time is multiplied by N. A cheap-looking inner node run 500k times is your bottleneck.

`BUFFERS` line: `shared hit=` is cache (fast), `shared read=` is from disk/OS (slow). Lots of `read` on a query that should be cached signals an undersized `shared_buffers` or a query touching far more data than necessary.

Watch for these annotations:
- **`Rows Removed by Filter: N`** — the node fetched rows then threw most away. A large value usually means a missing or unusable index; the predicate should have been an index condition instead of a post-scan filter.
- **`Sort Method: external merge Disk: NkB`** — the sort spilled to disk because it exceeded `work_mem`. Either raise `work_mem` for this workload or add an index that provides the order.
- **`Heap Fetches: N`** on an Index Only Scan — the visibility map is stale (needs vacuum) so it's hitting the heap anyway, defeating the index-only optimization.

## Scan types

- **Seq Scan** — reads the whole table. Correct and optimal for small tables or when a query genuinely needs most rows. A problem only when it's scanning a large table to return few rows → wants an index.
- **Index Scan** — walks an index, then fetches matching heap rows. Good for selective predicates.
- **Index Only Scan** — answers entirely from the index without touching the heap. Requires a covering index (all selected columns in the index, via key or `INCLUDE`) and an up-to-date visibility map. The fastest read pattern.
- **Bitmap Index Scan + Bitmap Heap Scan** — builds a bitmap of matching pages, then fetches them in physical order. The planner picks this when a predicate matches a moderate fraction of rows — too many for a plain index scan's random I/O, too few for a seq scan. Often optimal; not a problem to see this.

## Join algorithms

The planner picks among three based on table sizes, indexes, and row estimates:

- **Nested Loop** — for each outer row, probe the inner. Cheap when the outer side is tiny and the inner has an index on the join key. Catastrophic when both sides are large or the row estimate was wrong (you'll see millions of `loops`). A nested loop over big inputs is a classic sign of a misestimate.
- **Hash Join** — builds a hash table from the smaller side, probes with the larger. Great for large, unsorted inputs with an equality join. Needs `work_mem`; if the hash doesn't fit it batches to disk (slower). Seeing `Batches: >1` means the hash spilled.
- **Merge Join** — sorts both sides on the join key (or reads them pre-sorted from indexes) and merges. Good for large inputs already ordered, or with range join conditions.

If you see a nested loop where a hash join belongs, the cause is almost always a bad row estimate making the planner think the input is tiny. Fix the statistics, not the query.

## Common pathologies and fixes

| Symptom in plan | Likely cause | Fix |
|---|---|---|
| Seq Scan on large table, few rows returned | No usable index for the predicate | Add index matching the WHERE/JOIN columns |
| Estimated rows ≫ or ≪ actual | Stale or insufficient statistics | `ANALYZE table;` raise `default_statistics_target`; consider extended statistics |
| Nested loop with huge `loops=` | Misestimate; planner thought inner was small | Fix stats; sometimes an index on the inner join key |
| Sort spilling to disk | `work_mem` too small for this query | Raise `work_mem` (per-operation, set per-session for big reports) or add an ordering index |
| `Rows Removed by Filter` large | Index exists but predicate not sargable, or no index | Make predicate sargable; add/extend index |
| Index Only Scan with high `Heap Fetches` | Stale visibility map | `VACUUM table;` |
| Function on indexed column in WHERE | Index unusable (`WHERE lower(email)=...`) | Expression index `ON t (lower(email))` |

**Sargability** — a predicate must compare the bare indexed column to be index-usable. `WHERE created_at::date = '2024-01-01'` can't use an index on `created_at`; rewrite as a range `WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'`. Same for `WHERE col + 1 = 5` (→ `col = 4`) and leading-wildcard `LIKE '%foo'` (no B-tree help; needs trigram GIN).

## Statistics and the planner

The planner's decisions are only as good as its row estimates, which come from `ANALYZE`-collected statistics in `pg_statistic`.

- Run `ANALYZE` after bulk loads; autovacuum does it automatically but lags behind sudden large changes.
- For a column with many distinct values where estimates are off, raise its target: `ALTER TABLE t ALTER COLUMN c SET STATISTICS 1000;` then `ANALYZE t;`
- **Correlated columns** defeat the planner's independence assumption. If `WHERE city = 'X' AND country = 'Y'` is misestimated (city implies country), create extended statistics:
  ```sql
  CREATE STATISTICS s (dependencies, ndistinct) ON city, country FROM t;
  ANALYZE t;
  ```

## Query rewriting techniques

- **`EXISTS` vs `IN` vs `JOIN`** — for "rows in A that have a match in B," `EXISTS` (semi-join) often beats `IN` with a subquery and avoids duplicate-row issues that a `JOIN` introduces.
- **Keyset (cursor) pagination** beats `OFFSET` for deep pages. `OFFSET 100000` still scans and discards 100k rows. Instead: `WHERE (created_at, id) < (:last_ts, :last_id) ORDER BY created_at DESC, id DESC LIMIT 20`, backed by an index on `(created_at, id)`.
- **`LATERAL`** joins compute a per-row subquery (e.g., "top 3 orders per customer") that a plain join can't express cleanly.
- **CTEs** are no longer an optimization fence by default (since PG12 they can be inlined), but `WITH ... AS MATERIALIZED` forces materialization when you want it; `NOT MATERIALIZED` forces inlining.
- **`UNION ALL` vs `UNION`** — `UNION` deduplicates (a sort/hash); use `UNION ALL` when you know rows are distinct.

## Planner knobs (use sparingly, for diagnosis)

To test whether the planner *would* do better with a different plan, you can temporarily disable a node type for a session: `SET enable_seqscan = off;` then `EXPLAIN`. This is a **diagnostic**, not a fix — if forcing an index scan helps, the real fix is better statistics or a better index so the planner chooses it on its own. Leaving these off in production is a smell.
