# Schema & Data-Type Design

Choosing types, constraints, and a normalization level that the engine handles well.

## Contents
- Data type choices that matter
- Keys and identifiers
- Constraints as correctness and performance
- Normalization tradeoffs
- JSONB: when and when not
- Common modeling patterns

## Data type choices that matter

The right type saves space, enforces correctness, and helps the planner.

- **Integers:** `integer` (4 bytes, ±2.1B) for most counts/FKs; `bigint` (8 bytes) when a sequence could plausibly exceed 2.1B — surrogate PKs on high-volume tables should usually be `bigint` from day one (migrating int→bigint on a huge live table is painful). Don't use `numeric` for IDs.
- **Money:** **never `float`/`double`** — binary floating point can't represent decimal cents exactly. Use `numeric(precision, scale)` for exact monetary math, or store integer minor units (cents).
- **Text:** prefer `text` over `varchar(n)` unless a length limit is a real business rule. They're stored identically; `text` avoids arbitrary limits and pointless migrations. `char(n)` is almost never right (blank-padded).
- **Timestamps:** use **`timestamptz`** (timestamp *with* time zone), essentially always. It stores an absolute instant (UTC) and converts on display; plain `timestamp` stores a wall-clock with no zone and causes silent bugs across regions/DST. Store instants in `timestamptz`, format in the app.
- **Booleans:** `boolean`, not `char(1)`/`integer` flags.
- **Enums:** native `ENUM` types are compact and self-documenting but adding/reordering values is a DDL operation; a lookup table with an FK is more flexible if the set changes often. A `CHECK (status IN (...))` constraint is a lightweight middle ground.
- **UUIDs:** `uuid` type (16 bytes), not text (36+ bytes). For PKs, prefer time-ordered UUIDs (`uuidv7`, PG18 built-in `uuidv7()`, or generate app-side) over random `uuidv4` — random UUIDs scatter inserts across the B-tree causing page splits and poor cache locality. A `bigint` identity is even better for index locality if you don't need globally-unique-without-coordination.

## Keys and identifiers

- Use **`GENERATED ALWAYS AS IDENTITY`** for surrogate keys (SQL-standard, replaces `serial`, which has ownership/permission quirks).
- Declare a **primary key** on every table — it's the default replica identity and the natural clustering target.
- Add **foreign keys** for real referential integrity. They cost a little on write (a check) but prevent orphaned data the application would otherwise have to police imperfectly. **Index the referencing (child) column** — Postgres does *not* auto-create an index on the FK side, and an unindexed FK makes parent deletes/updates do a seq scan of the child and can cause lock contention.

## Constraints as correctness and performance

Constraints are not just validation — the planner uses them.

- **`NOT NULL`** lets the planner skip null-handling and enables some optimizations; declare it wherever a value is required.
- **`CHECK`** encodes invariants in one place (`CHECK (price >= 0)`), enforced regardless of which code path writes.
- **`UNIQUE`** creates an index and guarantees no duplicates — better than application-level dedup that races.
- **Exclusion constraints** (`EXCLUDE USING gist`) enforce "no two rows overlap" — e.g., no double-booked time ranges — which a unique constraint can't express.
- Prefer DB constraints over app-only checks: the database is the last line and the only one that holds under concurrency.

## Normalization tradeoffs

Default to a **normalized** design (3NF): each fact in one place, related by keys. It prevents update anomalies and keeps writes cheap and consistent.

Denormalize deliberately, only when a measured read pattern demands it — e.g., a frequently-read aggregate that's expensive to compute on the fly. When you do, you own keeping the copy in sync (triggers, application logic, or a materialized view), and you've traded write complexity for read speed. Don't pre-denormalize on a hunch; normalize first, then denormalize the proven hot path.

**Materialized views** cache an expensive query's result as a physical table you `REFRESH` on a schedule. `REFRESH MATERIALIZED VIEW CONCURRENTLY` (needs a unique index on the view) avoids locking readers during refresh. Good for dashboards/reports that tolerate slightly stale data.

## JSONB: when and when not

`jsonb` is powerful but often overused.

**Good uses:** genuinely schemaless or sparse attributes, third-party payloads stored whole, user-defined fields, document-shaped data with no fixed schema. Index containment queries with GIN (`CREATE INDEX ON t USING gin (data jsonb_path_ops)`), query with `@>`, `->`, `->>`, `jsonb_path_query`.

**Bad uses:** modeling structured relational data as a JSON blob to "avoid migrations." You lose type checking, FK integrity, efficient single-column indexing, and clear constraints; queries get awkward and the planner estimates poorly inside JSONB. If a field is queried, filtered, joined, or constrained, it should usually be a real column. Rule of thumb: **columns for what you query and constrain; JSONB for what you just store and retrieve whole.**

## Common modeling patterns

- **Soft delete:** a `deleted_at timestamptz` plus a partial index `WHERE deleted_at IS NULL` keeps "active rows" queries fast without scanning tombstones.
- **Audit/temporal:** append-only history tables, or `tstzrange` validity periods with an exclusion constraint to prevent overlaps.
- **Multi-tenancy:** a `tenant_id` column on every table with `tenant_id` as the **leading** column of composite indexes (so every query is tenant-pruned first); consider row-level security to enforce isolation at the engine.
- **Enumerations that grow:** lookup table + FK rather than native enum when values change frequently.

## Summary

Pick exact types (`timestamptz`, `numeric` for money, `bigint`/`uuidv7` PKs), declare NOT NULL/CHECK/UNIQUE/FK constraints (and index FK columns), normalize by default and denormalize only the measured hot path, and reserve JSONB for genuinely schemaless data rather than as an escape from schema design.
