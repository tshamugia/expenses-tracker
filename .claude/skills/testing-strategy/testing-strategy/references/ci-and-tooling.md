# CI & Tooling

Run the right tests at the right time so the suite stays fast enough that people actually run it. In an NX monorepo the lever is `nx affected` — test only what a change could have broken — plus parallelization and sharding for the slow layers.

## Contents
- [Test layers map to CI stages](#test-layers-map-to-ci-stages)
- [`nx affected` orchestration](#nx-affected-orchestration)
- [GitHub Actions pipeline](#github-actions-pipeline)
- [Ephemeral Postgres in CI](#ephemeral-postgres-in-ci)
- [Sharding e2e](#sharding-e2e)
- [Coverage gating that means something](#coverage-gating-that-means-something)
- [Retry and flakiness policy](#retry-and-flakiness-policy)
- [Caching](#caching)

## Test layers map to CI stages

Run cheap/fast on every push, expensive/slow less often. The principle: fail fast and cheap.

| Stage | Runs | When | Budget |
|------|------|------|--------|
| Lint + type-check | `nx affected -t lint typecheck` | every push | seconds |
| Unit | `nx affected -t test` (Vitest, node) | every push | < 1–2 min |
| Integration | `nx affected -t test:int` (Testcontainers) | every push / on PR | a few min |
| API e2e | `nx affected -t test:e2e` (supertest) | on PR | a few min |
| Browser e2e | Playwright critical set | pre-merge | minutes |
| Full browser e2e | Playwright full suite | nightly / pre-release | longer |

Keep each layer in its own NX target (`test`, `test:int`, `test:e2e`) with its own Vitest/Playwright config, so they can be run, cached, and parallelized independently.

## `nx affected` orchestration

`nx affected` computes the project graph diff between a base and head SHA and runs targets only for affected projects — the core reason a monorepo suite stays fast as it grows.

```bash
# PR: compare against the merge base
nx affected -t lint typecheck test --base=origin/main --head=HEAD --parallel=3

# integration + e2e, also affected-scoped
nx affected -t test:int --base=origin/main --head=HEAD
nx affected -t test:e2e --base=origin/main --head=HEAD
```

- On `main` pushes, use the last successful commit as base (`nx-set-shas` action) so you don't re-run everything.
- Use `--parallel` to run independent projects' tests concurrently.
- For DB-touching targets, ensure either each project gets its own container/schema or the target is configured to run serially (see isolation below) to avoid cross-project DB contention.

## GitHub Actions pipeline

```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # full history so affected can diff
      - uses: nrwl/nx-set-shas@v4  # sets base/head SHAs for affected
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci

      - run: npx nx affected -t lint typecheck --parallel=3
      - run: npx nx affected -t test --parallel=3 --coverage

      # Integration + API e2e need Docker (Testcontainers) — present on ubuntu-latest
      - run: npx nx affected -t test:int
      - run: npx nx affected -t test:e2e

  browser-e2e:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix: { shard: [1/2, 2/2] } # split the slow suite across runners
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --shard=${{ matrix.shard }}
```

## Ephemeral Postgres in CI

Two viable approaches; **Testcontainers is preferred** because the same test setup runs locally and in CI with no config drift.

**Testcontainers (recommended):** tests start their own container. Works locally and in CI identically — no `services:` block needed. `ubuntu-latest` includes Docker. Cache the postgres image to avoid pulling each run (see caching). The Testcontainers Ryuk container handles cleanup automatically.

**GitHub Actions service container (alternative):** a sidecar Postgres for the job. Less flexible (one shared instance), but slightly faster start if you're already on it:

```yaml
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready" --health-interval 5s --health-timeout 5s --health-retries 5
```

Either way: apply schema with the **real migration command** at the start of the DB-test stage, and isolate per the strategies in `references/integration-testing.md`. If running DB tests in parallel, give each worker its own database/schema (`test_${workerId}`) to prevent cross-talk.

## Sharding e2e

Browser e2e is the long pole. Split it across runners with Playwright's built-in sharding (`--shard=1/N` … `N/N`) via a CI matrix, as shown above. Merge the per-shard HTML/blob reports into one with `playwright merge-reports` if you want a single artifact. Sharding turns a 20-minute suite into ~5 minutes across 4 runners.

## Coverage gating that means something

Do **not** gate on a global percentage — it incentivizes assertion-free tests on trivial code and punishes you for honest gaps. Instead:

- **Gate on changed-line coverage** in the PR (e.g. via a coverage-diff action): new/modified lines in this PR must be covered, or the author justifies the exception. This keeps new code tested without a meaningless repo-wide number.
- **Report, don't block, the global trend** — surface it so it's visible, alert on regressions, but don't fail builds on it.
- **Prefer branch coverage** for logic-heavy libs; run **mutation testing** (Stryker) on the few critical domain modules in a nightly job, not per-PR (it's slow). A surviving mutant is a real test gap; a covered-but-unasserted line is invisible to plain coverage.

## Retry and flakiness policy

- **One retry in CI, zero locally.** A single CI retry absorbs genuine infra blips (network, container start). It is **not** a fix — any test that needed the retry is flaky and gets tracked to a root-cause fix (`references/pyramid-and-strategy.md`).
- **Never normalize retries.** Two+ retries hides real intermittent bugs and rots the suite's credibility.
- **Quarantine, don't disable silently.** Tag a flaky test, keep it visible on a flaky dashboard, and assign it. A disabled-and-forgotten test is a coverage lie.
- **Fail the build on console errors / unhandled rejections** in e2e where feasible — surfaces real bugs the assertions might miss.

## Caching

- **NX remote cache / Nx Cloud:** cache task outputs so unaffected/unchanged projects' test results are restored instantly across CI runs and machines. The single biggest CI speedup in an NX repo.
- **`npm ci` cache** via `actions/setup-node` `cache: 'npm'`.
- **Playwright browsers:** cache `~/.cache/ms-playwright`.
- **Docker image:** cache or pre-pull `postgres:16-alpine` so Testcontainers doesn't re-download each run.

The combined effect of `nx affected` + remote caching + sharding is that a typical PR runs only the handful of projects it touched, restores everything else from cache, and parallelizes the slow browser layer — keeping the whole pipeline in the single-digit-minutes range even as the monorepo grows.
