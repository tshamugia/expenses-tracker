# Integration Testing

The most valuable layer for this stack. Tests run against a **real PostgreSQL** (via Testcontainers) so they exercise actual SQL, constraints, transactions, cascades, indexes, JSON/array columns, and ORM behavior — where most production bugs live. Never mock the database to test database logic.

## Contents
- [Why real Postgres, not a mocked ORM](#why-real-postgres-not-a-mocked-orm)
- [Testcontainers setup](#testcontainers-setup)
- [Test isolation strategies](#test-isolation-strategies)
- [Prisma repository tests](#prisma-repository-tests)
- [Drizzle repository tests](#drizzle-repository-tests)
- [NestJS module integration](#nestjs-module-integration)
- [What to actually assert](#what-to-actually-assert)
- [Seeding and fixtures](#seeding-and-fixtures)

## Why real Postgres, not a mocked ORM

A mocked Prisma/Drizzle client returns whatever you tell it to. It cannot catch:
- a unique/foreign-key/check constraint violation,
- a cascade delete that removes (or fails to remove) related rows,
- a transaction that doesn't actually roll back on error,
- an `ON CONFLICT`/upsert that behaves differently than you assumed,
- JSON/JSONB or array column round-tripping quirks,
- a missing index causing a query to return unexpected ordering,
- timezone/`timestamptz` coercion, numeric precision, or `null` vs `undefined` handling,
- row-level security policies.

These are exactly the failures that reach production. Testcontainers spins up a disposable real Postgres in a few seconds, giving you genuine confidence with no shared-DB flakiness. Use SQLite-in-memory only if you have *zero* Postgres-specific features — which, with Prisma/Drizzle on Postgres, you don't.

## Testcontainers setup

```typescript
// test/postgres.setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

let container: StartedPostgreSqlContainer;

export async function startTestDb(): Promise<string> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  // Apply the real schema the same way production does:
  // Prisma:
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
  // Drizzle:
  // execSync('npx drizzle-kit migrate', { env: process.env, stdio: 'inherit' });

  return url;
}

export async function stopTestDb() {
  await container?.stop();
}
```

Wire lifecycle in Vitest. Start **one container per test file** (or per worker) — starting per-test is too slow. Use `globalSetup` for a single shared container across the whole run when tests don't conflict, or per-file containers for stronger isolation:

```typescript
// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    globalSetup: ['./test/global-setup.ts'], // start/stop one container
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // serialize DB tests, or give each worker its own schema
    hookTimeout: 60_000, // container start + migrate can take a bit on cold pull
  },
});
```

**CI note:** Testcontainers needs a Docker daemon. GitHub Actions `ubuntu-latest` has Docker available. See `references/ci-and-tooling.md` for ephemeral-DB orchestration and caching the postgres image.

## Test isolation strategies

Every test needs a clean, predictable DB state and must not leak into others. Three approaches, fastest first:

**1. Transaction rollback (fastest, preferred for repository tests).** Begin a transaction in `beforeEach`, run the test against that transaction's client, roll back in `afterEach`. Nothing is ever committed, so isolation is perfect and cleanup is instant.

```typescript
// Prisma: use an interactive transaction and inject the tx client into the repo
let tx: Prisma.TransactionClient;
beforeEach(async () => {
  // Prisma can't expose a long-lived rollback-able tx trivially; many teams
  // use the `@chax-at/transactional-prisma-testing` pattern or truncate (option 2).
});
```

Prisma's API makes true rollback-per-test awkward; Drizzle (built on a raw driver) supports it cleanly:

```typescript
// Drizzle with postgres-js / node-postgres
beforeEach(async () => {
  await db.execute(sql`BEGIN`);
});
afterEach(async () => {
  await db.execute(sql`ROLLBACK`);
});
```

**2. Truncate + reseed between tests (robust, simple, works for both ORMs).** Fast enough for most suites; the safe default with Prisma.

```typescript
afterEach(async () => {
  // TRUNCATE all tables, restart identities, cascade FKs — one statement
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "Order","CartItem","User" RESTART IDENTITY CASCADE;`,
  );
});
```

**3. Fresh container per file (strongest isolation, slowest).** Reserve for tests that must not share *any* state, or that test migrations/DDL themselves.

Whatever you choose: never rely on test execution order, and never share mutable rows between tests.

## Prisma repository tests

Test the repository against real Postgres so constraints and relations are exercised.

```typescript
import { PrismaClient } from '@prisma/client';
import { UserRepository } from './user.repository';

const prisma = new PrismaClient(); // DATABASE_URL points at the container
const repo = new UserRepository(prisma);

describe('UserRepository (real Postgres)', () => {
  afterEach(() => prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" RESTART IDENTITY CASCADE;`));

  it('enforces the unique email constraint', async () => {
    await repo.create({ email: 'a@x.com', role: 'MEMBER' });
    await expect(repo.create({ email: 'a@x.com', role: 'MEMBER' }))
      .rejects.toMatchObject({ code: 'P2002' }); // real Prisma constraint error
  });

  it('cascades deletes to owned orders', async () => {
    const user = await repo.create({ email: 'b@x.com', role: 'MEMBER' });
    await prisma.order.create({ data: { userId: user.id, total: 100 } });
    await repo.delete(user.id);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
  });

  it('round-trips a JSONB metadata column', async () => {
    const u = await repo.create({ email: 'c@x.com', role: 'MEMBER', metadata: { tier: 'gold' } });
    const reloaded = await repo.findById(u.id);
    expect(reloaded?.metadata).toEqual({ tier: 'gold' });
  });
});
```

## Drizzle repository tests

Same principle; Drizzle's closeness to the driver makes transaction-rollback isolation clean.

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { users, orders } from './schema';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

describe('userRepository (real Postgres)', () => {
  beforeEach(() => db.execute(sql`BEGIN`));
  afterEach(() => db.execute(sql`ROLLBACK`));

  it('rejects a duplicate email', async () => {
    await db.insert(users).values({ email: 'a@x.com', role: 'MEMBER' });
    await expect(
      db.insert(users).values({ email: 'a@x.com', role: 'MEMBER' }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('returns orders ordered by createdAt when an index/ORDER BY is relied on', async () => {
    // exercises real ordering — a mock would never catch a missing ORDER BY
    const [u] = await db.insert(users).values({ email: 'b@x.com', role: 'MEMBER' }).returning();
    await db.insert(orders).values([
      { userId: u.id, total: 1, createdAt: new Date('2025-01-02') },
      { userId: u.id, total: 2, createdAt: new Date('2025-01-01') },
    ]);
    const rows = await db.select().from(orders).where(eq(orders.userId, u.id)).orderBy(orders.createdAt);
    expect(rows.map(r => r.total)).toEqual([2, 1]);
  });
});
```

## NestJS module integration

Boot a slice of the real DI graph with `Test.createTestingModule`, override only external boundaries (payment, email), and let the repository hit real Postgres. This verifies that providers wire together correctly *and* that the data layer works — the integration most teams never test.

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [OrdersModule, PrismaModule], // real modules
})
  .overrideProvider(PaymentGateway).useValue(fakePayments) // unowned external → fake
  .compile();

const service = moduleRef.get(OrdersService);

it('persists the order and decrements stock atomically', async () => {
  fakePayments.charge.mockResolvedValue({ ok: true });
  await service.checkout(cartId);
  // assert real DB side effects across tables — the transaction actually committed both
  expect(await prisma.order.count()).toBe(1);
  expect((await prisma.product.findUnique({ where: { id } }))!.stock).toBe(initialStock - 1);
});

it('leaves stock unchanged when payment fails (transaction rolled back)', async () => {
  fakePayments.charge.mockRejectedValue(new Error('declined'));
  await expect(service.checkout(cartId)).rejects.toThrow();
  expect(await prisma.order.count()).toBe(0);
  expect((await prisma.product.findUnique({ where: { id } }))!.stock).toBe(initialStock);
});
```

That second test is the canonical example of a bug a mocked DB can never catch: whether your service's transaction *actually* rolls back all writes on failure.

## What to actually assert

At the integration level, assert on **observable DB state and real errors**, not internal calls:
- Rows exist / don't exist with the expected values after the operation.
- Constraint violations surface as the real ORM/driver error (`P2002`, `23505`, etc.).
- Cascades and `ON DELETE`/`ON UPDATE` behave as the schema declares.
- Transactions commit *all* writes on success and roll back *all* on failure.
- Queries return the expected ordering/filtering/pagination (catches missing `ORDER BY`, off-by-one in `LIMIT/OFFSET`, wrong join).
- Aggregations and `GROUP BY` produce correct totals (money math especially).
- JSONB/array/enum columns round-trip.

## Seeding and fixtures

- Reuse the **factory/builder** functions from `references/pyramid-and-strategy.md`, but have them *insert and return the persisted row* for integration tests.
- Seed the **minimum** needed for the scenario — large shared seed files create hidden coupling and slow tests. Prefer per-test seeding via factories.
- Keep seed data **deterministic** (fixed ids/dates) so assertions are stable.
- Apply schema via the **real migration command** (`prisma migrate deploy` / `drizzle-kit migrate`), never by hand-crafting tables — this also tests that migrations apply cleanly to an empty DB.
