# E2E & API Testing

The top of the pyramid: full HTTP contract tests and real-browser user journeys. Highest confidence, highest cost — spend it on the contracts and journeys that, if broken, mean lost revenue or trust. Everything cheaper belongs lower in the pyramid.

## Contents
- [Two distinct things called "e2e"](#two-distinct-things-called-e2e)
- [NestJS HTTP/API e2e with supertest](#nestjs-httpapi-e2e-with-supertest)
- [Auth in API e2e](#auth-in-api-e2e)
- [Next.js browser e2e with Playwright](#nextjs-browser-e2e-with-playwright)
- [Auth and isolation in browser e2e](#auth-and-isolation-in-browser-e2e)
- [Page object model](#page-object-model)
- [Next.js Server Actions and data flow](#nextjs-server-actions-and-data-flow)
- [Contract testing across the monorepo](#contract-testing-across-the-monorepo)
- [How many e2e tests](#how-many-e2e-tests)

## Two distinct things called "e2e"

1. **API/HTTP e2e** — boot the real Nest app, hit it over HTTP with supertest, against a real DB. Tests the full pipe → guard → controller → service → repo → filter stack and the response contract. Fast-ish, run on every push for critical endpoints.
2. **Browser e2e** — drive a real browser (Playwright) through the deployed frontend + backend. Tests the actual user journey. Slow; run pre-merge/nightly on a small critical set.

Use API e2e for *contract* coverage (status codes, validation, auth, shapes) and browser e2e for *journey* coverage (the user can actually sign up and check out). Don't duplicate: if an API e2e already proves the endpoint rejects bad input, the browser test shouldn't re-prove it — it should prove the user reaches the right screen.

## NestJS HTTP/API e2e with supertest

Boot the app exactly as production does (same global pipes, guards, filters), back it with a Testcontainers Postgres (`references/integration-testing.md`), and assert the wire contract.

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Orders (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentGateway).useValue(fakePayments) // external boundary faked
      .compile();

    app = moduleRef.createNestApplication();
    // mirror main.ts so the test exercises the REAL pipeline:
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('400s on invalid body (ValidationPipe runs)', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({ qty: -1 })
      .expect(400)
      .expect((res) => expect(res.body.message).toBeDefined()));

  it('401s without auth', () =>
    request(app.getHttpServer()).get('/orders/me').expect(401));

  it('creates an order and returns the contract shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ sku: 'A', qty: 2 }] })
      .expect(201);
    expect(res.body).toMatchObject({ id: expect.any(String), status: 'PENDING' });
  });
});
```

Key point: **construct the app the same way `main.ts` does** (global pipes/filters/interceptors). A common bug is e2e tests passing because the test app skips the global `ValidationPipe` that production uses — so validation is never actually exercised.

## Auth in API e2e

Don't drive the real login UI for API tests. Mint a token directly using the same signing service the app uses, or expose a test-only auth helper.

```typescript
const jwt = app.get(JwtService);
const token = jwt.sign({ sub: user.id, role: 'MEMBER' });
// ...then set Authorization: Bearer ${token}
```

Test the *authorization* contract explicitly: a `MEMBER` token gets 403 on an admin route, an expired token gets 401, a token for user A can't read user B's resource (the ownership check). These are high-value tests — authz bugs are security bugs.

## Next.js browser e2e with Playwright

Playwright is preferred (auto-waiting, multi-browser, fast, excellent traces). Run against a real built app and real backend.

```typescript
// e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';

test('a member can complete checkout', async ({ page }) => {
  await page.goto('/cart');
  await page.getByRole('button', { name: /add sample item/i }).click();
  await page.getByRole('button', { name: /checkout/i }).click();
  await expect(page.getByText(/order confirmed/i)).toBeVisible();
  // assert the observable user-facing result, not internal calls
});
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run start',         // build + start the real app
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  retries: process.env.CI ? 1 : 0,     // one retry in CI to absorb infra blips, then FIX flakiness
  workers: process.env.CI ? 2 : undefined,
});
```

- **Never use fixed sleeps.** Playwright auto-waits for elements; assert on visible state (`toBeVisible`, `toHaveURL`), never `waitForTimeout`.
- **Query by role/label/text**, same as component tests — resilient and accessibility-aligned.
- **Keep the backend real** (with external boundaries like payment stubbed via env/test mode), backed by an ephemeral Postgres seeded to a known state.

## Auth and isolation in browser e2e

- **Authenticate once, reuse storage state.** Log in in a global setup, save `storageState`, and inject it into tests so each test starts authenticated without re-driving the login form. Reserve actual login-flow tests for the auth journey itself.
- **Isolate test data per run.** Seed a fresh DB (or a per-run schema) so parallel runs and reruns don't collide. Never point e2e at a shared staging DB with mutable shared rows.
- **Reset state between tests** (truncate-reseed or per-worker DB) just like integration tests.

```typescript
// global-setup.ts
import { chromium } from '@playwright/test';
export default async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.context().storageState({ path: 'e2e/.auth/member.json' });
  await browser.close();
}
```

## Page object model

For non-trivial suites, wrap pages in small objects so selectors live in one place and tests read as intent. Don't over-engineer — a thin helper per page is enough.

```typescript
class CheckoutPage {
  constructor(private page: Page) {}
  goto() { return this.page.goto('/cart'); }
  checkout() { return this.page.getByRole('button', { name: /checkout/i }).click(); }
  confirmation() { return this.page.getByText(/order confirmed/i); }
}
```

## Next.js Server Actions and data flow

App Router Server Actions and Server Components run on the server with real data access, so they're best covered by integration or e2e tests, not jsdom component tests:

- **Server Action logic** (mutations) → test like a service: call the action with a real DB behind it (integration), asserting DB state and returned result. Fake only external boundaries.
- **Server Component data fetching** → cover via browser e2e (the page renders the right data) or by extracting the data-fetching function and integration-testing it against real Postgres. Don't try to render Server Components in jsdom.
- **Route Handlers (`app/api/.../route.ts`)** → these are HTTP endpoints; test them like the NestJS API e2e above (real request in, contract out) or with `next-test-api-route-handler`.
- **Client interactivity** → component tests with Testing Library (`references/unit-testing.md`), mocking the network with MSW.

## Contract testing across the monorepo

In an NX monorepo where the Next.js frontend and NestJS backend evolve independently, contract tests stop a backend change from silently breaking the frontend without running the full slow browser suite on every change:

- **Schema-derived contracts:** generate an OpenAPI spec from Nest (`@nestjs/swagger`) and assert the frontend's client types/mocks match it; fail CI on a breaking diff.
- **Consumer-driven contracts (Pact):** the frontend (consumer) declares the requests it makes and expected responses; the backend (provider) verifies it satisfies them. Each side tests against the contract, not the live other side — fast and decoupled.
- **Shared types as a contract:** if both sides import the same TS types from a shared NX lib, a breaking change fails the type-check across `nx affected` — the cheapest "contract test" you can get.

## How many e2e tests

Few. Browser e2e is the most expensive test you own (slowest, flakiest, highest maintenance). Cover:
- the 1–5 journeys whose breakage is unacceptable (signup, login, the core money/conversion flow, a critical permission boundary);
- one happy path per major feature, not every branch.

Everything else — validation rules, error messages, edge cases, authz matrices — push down to API e2e and integration tests where it's faster and more stable. If you find yourself writing the tenth browser test for a feature, most of them probably belong one level down.
