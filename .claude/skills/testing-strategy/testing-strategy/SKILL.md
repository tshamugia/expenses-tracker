---
name: testing-strategy
description: Expert testing strategy for TypeScript monorepos with NestJS backends, Next.js frontends, and PostgreSQL (Prisma/Drizzle). Use whenever the user designs, reviews, or expands a test suite — deciding what to test, at which level, and how to structure unit/integration/e2e tests. Covers the test pyramid and when to deviate, mocking vs. real dependencies, Testcontainers-backed Postgres integration tests, NestJS service/guard testing, Next.js component and Server Action testing, Playwright e2e, contract testing, meaningful coverage, flaky-test triage, and CI with `nx affected`. Triggers on "test strategy," "how should I test," "unit vs integration," "test pyramid," "Testcontainers," "mock the database," "e2e," "Playwright," "Vitest," "supertest," "flaky test," "integration test," "what should I test," or any request to plan or improve testing for a TS/Nest/Next/Postgres project — even when the user just says "add tests" or "is this tested enough?" Prefer this over generic testing advice for this stack.
---

# Testing Strategy

Design test suites that catch real bugs cheaply and stay fast as the codebase grows. This skill encodes a decision framework — *what* to test, at *which* level, with *which* dependencies real vs. faked — tuned for a TypeScript stack: NestJS (modular monolith on NX), Next.js (App Router), and PostgreSQL via Prisma or Drizzle.

The goal is not "more tests." It is the smallest set of tests that gives high confidence per second of runtime and per line of maintenance. Most teams get this wrong by writing too many brittle unit tests that mock everything (testing the mocks, not the system) and too few integration tests against a real database (where most bugs actually live).

## How to use this skill

1. Identify the layer in question: a pure function/algorithm, a service with dependencies, an HTTP boundary, a DB query, a React component, or a full user flow.
2. Apply the **Decision framework** below to place the test at the right level and decide what is real vs. faked.
3. Open the matching reference file for copy-ready setup and patterns — don't reconstruct test harnesses from memory; the wiring (Testcontainers lifecycle, NestJS `Test.createTestingModule`, Playwright fixtures) is where teams lose hours.
4. For library specifics or version drift, query Context7 (`/vitest-dev/vitest`, `/nestjs/docs`, `/microsoft/playwright`, `/testcontainers/testcontainers-node`) rather than guessing.

## Reference files

Read the relevant file before writing tests in that area:

| File | When to read |
|------|--------------|
| `references/pyramid-and-strategy.md` | Choosing a level, what to test where, coverage targets, what NOT to test, flaky-test triage, test data builders |
| `references/unit-testing.md` | Pure functions, algorithms, NestJS services in isolation, Vitest/Jest setup, mocking discipline, table-driven tests, property-based testing |
| `references/integration-testing.md` | Testcontainers + real Postgres, Prisma/Drizzle repository tests, NestJS module integration, transaction rollback isolation, seeding |
| `references/e2e-testing.md` | NestJS HTTP e2e with supertest, Next.js Playwright/Cypress flows, auth setup, test isolation, page objects, API contract tests |
| `references/ci-and-tooling.md` | `nx affected` test orchestration, parallelization, coverage gating, sharding e2e, ephemeral DBs in CI, retry policy |

## The test pyramid (and where to bend it)

The classic pyramid — many fast unit tests, fewer integration tests, very few slow e2e tests — is a cost/confidence heuristic, not a law. Use it as the default shape, then deviate deliberately.

```
        /\        E2E  (few)        full user flow, real browser/HTTP, real DB
       /  \                          slow, high-confidence, high-maintenance
      /----\     INTEGRATION (some)  service + real DB, module wiring, repos
     /      \                         medium speed, catches the bugs that matter
    /--------\   UNIT (many)          pure logic, algorithms, isolated services
   /__________\                       fast, cheap, precise failure messages
```

**The single most important rule for this stack:** business logic that touches the database is tested at the **integration** level against a **real PostgreSQL** (via Testcontainers), not with a mocked Prisma/Drizzle client. Mocking the ORM tests your assumptions about the ORM, not the actual SQL, constraints, cascades, transactions, and JSON/array behavior — which is exactly where production bugs hide. See `references/integration-testing.md`.

**Deviate toward more integration tests** when the system is CRUD-heavy or query-heavy — most of the risk is in data access, so the "honeycomb"/"trophy" shape (fat integration middle) beats a tall unit pyramid. **Keep the pyramid tall** when you have rich domain algorithms (pricing, scheduling, permission resolution, BOM generation) — those deserve dense, fast unit tests.

## Decision framework (apply to every "should I test this?" question)

**1. Is it a pure function or self-contained algorithm?** → **Unit test**, no mocks. Cover the contract + edge cases + a few adversarial inputs. Consider table-driven tests and, for anything with a clear invariant, property-based testing. (`references/unit-testing.md`)

**2. Is it a service method with collaborators (other services, a logger, a clock)?** → **Unit test** the orchestration logic, faking only the *boundaries you don't own or that are slow/nondeterministic* (network, time, randomness). Do **not** reflexively mock everything — over-mocking produces tests that pass while the system is broken. Prefer real instances of your own pure collaborators.

**3. Does it execute real SQL / depend on DB behavior (constraints, transactions, cascades, indexes, RLS, JSON columns)?** → **Integration test** against real Postgres. This is non-negotiable for repositories and any service whose correctness depends on the database. (`references/integration-testing.md`)

**4. Is it the HTTP contract of an endpoint (status codes, auth, validation, response shape)?** → **e2e/API test** with supertest against a booted Nest app + real DB, or a contract test. (`references/e2e-testing.md`)

**5. Is it a React component's rendering/interaction logic?** → **Component test** (Testing Library + Vitest/jsdom). Test behavior the user observes, not implementation details. (`references/unit-testing.md` → components section)

**6. Is it a critical end-to-end user journey (signup → action → result)?** → **Browser e2e** (Playwright) — but only for the handful of journeys that, if broken, mean revenue/trust loss. e2e is the most expensive test you own; spend it where it counts. (`references/e2e-testing.md`)

**7. Would the test still pass if the feature were silently broken?** → It's a bad test. Delete or rewrite it. A test must be able to fail for the right reason.

## Core principles (apply to every test you write)

**Test behavior, not implementation.** Assert on observable outputs and side effects (what the caller/user sees), never on internal calls unless the call *is* the contract (e.g. "an audit entry was persisted"). Tests coupled to implementation break on every refactor and provide false security. The litmus test: could you rewrite the internals without touching the test? If not, you're testing the wrong thing.

**Isolate by data, not by mocking, at the integration level.** Each integration/e2e test gets a clean DB state — ideally by running inside a transaction that rolls back, or by truncating/reseeding between tests. Tests must not depend on execution order or leak state. See `references/integration-testing.md` for the transaction-rollback pattern.

**Fake only what you must.** Fake the *unowned, slow, or nondeterministic*: third-party HTTP, payment gateways, email/SMS, the system clock, randomness, the current user. Keep everything you own and control real. Every mock is a claim about how a dependency behaves — and an untested claim. Minimize them.

**Make failures legible.** One logical assertion per test where practical; descriptive names that state the scenario and expectation (`rejects checkout when cart is empty`, not `test checkout 2`). When a test fails, the name and message should tell you what broke without reading the body.

**Determinism is mandatory.** No reliance on real time, real network, sleep-based waits, or ordering of parallel tests. Inject the clock, stub randomness, await explicit conditions (not `setTimeout`). Flaky tests are worse than no tests — they erode trust until the suite is ignored. Triage flakiness immediately (see `references/pyramid-and-strategy.md`).

**Coverage is a smoke detector, not a goal.** Track it to find *untested* areas, never chase a number. 100% line coverage with assertion-free or implementation-coupled tests is worthless; 70% coverage concentrated on business logic and data access with real dependencies is excellent. Gate CI on coverage *not dropping* in changed code, not on a global percentage. See `references/ci-and-tooling.md`.

**Speed is a feature.** Unit tests run in milliseconds; the whole unit+integration suite should run on every push in minutes via `nx affected`. Reserve full e2e for pre-merge/nightly. Slow suites stop being run. See `references/ci-and-tooling.md`.

## Recommended tooling for this stack

| Layer | Tool | Why |
|------|------|-----|
| Unit / component | **Vitest** (Jest-compatible API, faster, native ESM/TS) — Jest acceptable on existing setups | Speed, TS/ESM, watch mode, in-source tests |
| NestJS unit/integration | `@nestjs/testing` `Test.createTestingModule` | First-class DI override for swapping real/fake providers |
| Real Postgres for tests | **Testcontainers** (`@testcontainers/postgresql`) | Real engine per run/suite; no shared dev DB; reproducible in CI |
| API / HTTP e2e | **supertest** against booted Nest app | Tests the real pipe/guard/filter stack end to end |
| Browser e2e | **Playwright** (preferred) or Cypress | Auto-wait, multi-browser, fast, great trace/debug story |
| React components | **Testing Library** (`@testing-library/react`) + jsdom | Behavior-first, discourages implementation coupling |
| Contract testing (optional) | **Pact** or schema/OpenAPI assertions | Decouples frontend/backend test cycles across the monorepo |
| Orchestration | **`nx affected`** + Vitest/Playwright projects | Run only what changed; parallelize; shard e2e |

When in doubt on a specific API or version, pull current docs via Context7 instead of relying on memory.

## What good looks like (target distribution for this stack)

A healthy CRUD/SaaS service typically lands around: **~60% unit** (dense on domain algorithms, thin on glue code), **~30% integration** (real-DB repository and service tests, NestJS module wiring), **~10% e2e** (HTTP contract tests + a small set of critical browser journeys). Query-heavy services shift toward 50/40/10. These are starting points — let the *risk profile* of the code decide, not a quota. Spend your testing budget where a bug would hurt most and where the code is hardest to reason about by inspection.
