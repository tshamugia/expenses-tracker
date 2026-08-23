# Pyramid & Strategy

Detailed decision rules for placing tests at the right level, setting coverage targets that mean something, deciding what *not* to test, building test data maintainably, and triaging flakiness.

## Contents
- [Choosing the level](#choosing-the-level)
- [What NOT to test](#what-not-to-test)
- [Coverage targets that mean something](#coverage-targets-that-mean-something)
- [Test data builders](#test-data-builders)
- [Naming and structure](#naming-and-structure)
- [Flaky-test triage](#flaky-test-triage)
- [Anti-patterns to avoid](#anti-patterns-to-avoid)

## Choosing the level

Walk down this list and stop at the first match. The principle: push tests as low (fast/cheap) as possible *without* mocking away the thing that could actually break.

| The code... | Test at | Real dependencies | Rationale |
|---|---|---|---|
| Pure function, algorithm, mapper, validator | **Unit** | none | Deterministic; mocks add nothing |
| Service orchestrating *owned* collaborators | **Unit** | real owned collaborators; fake only clock/random/network | Over-mocking hides integration bugs |
| Repository / any code whose correctness depends on SQL, constraints, transactions, cascades | **Integration** | real Postgres (Testcontainers) | Mocked ORM tests assumptions, not reality |
| Service that reads/writes through a repo as part of its job | **Integration** | real Postgres | The DB *is* the logic here |
| HTTP endpoint contract (status, auth, validation, shape) | **e2e/API** | booted Nest app + real DB | Tests the full pipe/guard/filter stack |
| React component rendering & interaction | **Component** | RTL + jsdom | Behavior the user sees |
| Critical user journey across screens | **Browser e2e** | Playwright, real app | Confidence in the whole system |

**Rule of thumb for the pyramid shape:** if the service is mostly moving data in and out of Postgres, lean into a fat integration layer (trophy/honeycomb). If it has rich, branchy domain logic, keep a tall unit base. Don't apply one shape dogmatically across a whole monorepo — decide per library/module.

## What NOT to test

Writing the wrong tests is worse than writing none — they cost maintenance and give false confidence. Skip:

- **Framework internals and third-party libraries.** Don't test that NestJS injects a provider, that Prisma runs a `findUnique`, or that Zod validates a string. Trust your dependencies; test *your* use of them at the integration level where it matters.
- **Trivial glue with no logic.** A one-line controller that calls `service.x()` and returns it doesn't need a unit test — it's covered by the endpoint's e2e/API test.
- **Getters/setters, DTO shape, type-level guarantees.** The TypeScript compiler already proves these. A test asserting a field exists is noise.
- **Generated code, migrations' SQL syntax, config files.** Validate config at boot (it either starts or doesn't); don't unit-test it.
- **Implementation details you intend to refactor.** If asserting on a private method or an internal call count, you're locking in the current implementation. Test the observable contract instead.
- **Exhaustive permutations a property test covers better.** Don't hand-write 40 near-identical cases; use table-driven or property-based testing.

A useful filter: *"If this test fails, will it tell me about a real defect a user could hit?"* If no, don't write it.

## Coverage targets that mean something

Coverage measures which lines *ran*, not whether they were *verified*. Treat it as a way to find blind spots, never as a target to hit.

- **Gate on change, not on the global number.** In CI, fail the PR if coverage of *changed lines* drops, or if new files land with no tests — not if the repo isn't at 80%. Chasing a global percentage incentivizes assertion-free tests on easy code.
- **Weight by risk.** Aim high (90%+ branch coverage) on domain algorithms — pricing, scheduling, permission/role resolution, BOM generation, anything with branchy logic. Accept lower coverage on thin glue. A single risk-weighted number lies; look at *where* the coverage is.
- **Prefer branch/condition coverage over line coverage** for logic-heavy code — line coverage marks an `if` covered when only one branch ran.
- **Mutation testing** (e.g. Stryker) is the real measure of test quality for critical algorithms: it mutates your code and checks whether tests catch it. If a mutant survives, your tests run the line but don't actually assert on its behavior. Use it selectively on your most important domain modules, not the whole repo.

## Test data builders

Inline object literals scattered across tests rot fast: add a required field and 200 tests break. Centralize construction.

**Builder/factory pattern** — a function returning a valid default, with overrides:

```typescript
// test/factories/user.factory.ts
export const makeUser = (overrides: Partial<User> = {}): User => ({
  id: crypto.randomUUID(),
  email: 'test@example.com',
  role: 'MEMBER',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});
```

Tests then state only what's *relevant to the scenario*, which doubles as documentation:

```typescript
const admin = makeUser({ role: 'ADMIN' });
const noEmail = makeUser({ email: '' });
```

For DB integration tests, pair builders with a seeding helper that inserts and returns the persisted row, so factories work both for in-memory unit tests and real-DB tests. Keep factories deterministic by default (fixed dates, predictable ids) and only introduce randomness deliberately. Consider Fishery (typed factories) or `@faker-js/faker` for volume, but pin the seed for reproducibility.

## Naming and structure

- **Name the scenario and the expectation**, present tense: `returns 409 when email already registered`, `rolls back order when payment fails`. A reader scanning failures should understand the bug without opening the body.
- **Arrange / Act / Assert** with visual separation. One *logical* assertion per test (multiple `expect`s describing one outcome are fine).
- **`describe` by unit-under-test, nested `describe` by scenario.** Avoid deeply nested `beforeEach` chains that hide setup — explicit setup in the test, or a shared factory, beats magic shared state.
- **Co-locate unit tests** with source (`foo.ts` + `foo.spec.ts`); keep integration/e2e in a `test/` or `e2e/` dir with their own (heavier) setup and config so they can be run separately.

## Flaky-test triage

A flaky test fails intermittently without a code change. They are corrosive: once a suite is "known flaky," real failures get ignored. Treat flakiness as a P1 bug, not a retry candidate.

**Quarantine then fix, don't just retry.** Auto-retry masks flakiness and lets it spread. If you must retry to keep CI green short-term, tag the test and track it to a fix; don't make retries the permanent policy.

Common causes and fixes:
- **Time dependence** → inject the clock (`Clock` provider / `vi.useFakeTimers()`); never assert on `Date.now()` deltas.
- **Async race / arbitrary waits** → replace `sleep(500)` with explicit waits for a condition (Playwright auto-wait, `waitFor` in RTL, polling a DB row). Never time-box async with magic numbers.
- **Shared state / order dependence** → ensure per-test isolation (transaction rollback or truncate-reseed); never let one test's writes leak into another.
- **Test pollution from parallelism** → give each parallel worker its own DB schema/container, or run DB-touching tests in a separate, serialized project.
- **Nondeterministic ordering of results** → assert on sets, or add explicit `ORDER BY`; don't assume DB row order.
- **Network/3rd-party** → never hit real external services in tests; stub at the boundary.

## Anti-patterns to avoid

- **The mockery:** mocking so much that the test only verifies the mocks were called in the expected order. It passes when the system is broken. Prefer real collaborators and integration tests.
- **Ice-cream cone:** many slow e2e tests, few unit tests. Inverted pyramid → slow, flaky, expensive suite.
- **Assertion-free tests:** code runs, nothing is checked. Inflates coverage, catches nothing.
- **Testing the test double:** asserting your stub returned what you told it to return.
- **One giant test:** a 200-line test exercising ten behaviors; when it fails you can't tell which. Split it.
- **Snapshot overuse:** giant auto-approved snapshots that everyone updates blindly. Use snapshots only for small, intentional, reviewed output.
