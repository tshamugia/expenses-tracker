# Unit Testing

Fast, deterministic, no I/O. Pure logic, algorithms, isolated NestJS services, and React components. The base of the pyramid — these should run in milliseconds and have precise failure messages.

## Contents
- [Vitest setup](#vitest-setup)
- [Pure functions and algorithms](#pure-functions-and-algorithms)
- [Table-driven tests](#table-driven-tests)
- [Property-based testing](#property-based-testing)
- [NestJS services in isolation](#nestjs-services-in-isolation)
- [Mocking discipline](#mocking-discipline)
- [Controlling time and randomness](#controlling-time-and-randomness)
- [React component tests](#react-component-tests)

## Vitest setup

Vitest is the recommended runner (Jest-compatible API, faster, native ESM/TS). On an existing Jest project the patterns below translate almost 1:1 (`jest.fn` ↔ `vi.fn`, `jest.mock` ↔ `vi.mock`).

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite()], // fast TS transform; good for NestJS decorators/metadata
  test: {
    globals: true,
    environment: 'node',        // 'jsdom' for component tests (separate project)
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Don't set a global threshold and chase it. Gate on changed-line coverage in CI instead.
    },
  },
});
```

For decorator metadata (NestJS) ensure `emitDecoratorMetadata` works — the SWC plugin above handles it; with `ts-jest`/`@swc/jest` configure equivalently.

## Pure functions and algorithms

No mocks. Cover the contract, the edges, and a few adversarial inputs. This is where dense testing pays off — these tests are cheap and catch the subtle bugs.

```typescript
import { describe, it, expect } from 'vitest';
import { calculateTierPrice } from './pricing';

describe('calculateTierPrice', () => {
  it('applies no discount below the first threshold', () => {
    expect(calculateTierPrice({ qty: 5, unit: 100 })).toBe(500);
  });

  it('applies the 10% tier at the boundary (inclusive)', () => {
    expect(calculateTierPrice({ qty: 10, unit: 100 })).toBe(900);
  });

  it('throws on negative quantity rather than returning garbage', () => {
    expect(() => calculateTierPrice({ qty: -1, unit: 100 })).toThrow(/quantity/i);
  });
});
```

Always include: the happy path, each boundary (off-by-one is the #1 algorithm bug), empty/zero/null inputs, and at least one "this should be rejected" case. For algorithms with a known-correct but slow reference implementation, assert the fast version matches the reference on a range of inputs.

## Table-driven tests

When many cases share structure, a table keeps them readable and makes gaps obvious.

```typescript
describe.each([
  { qty: 1,   unit: 100, expected: 100  },
  { qty: 9,   unit: 100, expected: 900  },
  { qty: 10,  unit: 100, expected: 900  }, // 10% kicks in
  { qty: 100, unit: 100, expected: 8000 }, // 20% tier
])('calculateTierPrice(qty=$qty)', ({ qty, unit, expected }) => {
  it(`= ${expected}`, () => {
    expect(calculateTierPrice({ qty, unit })).toBe(expected);
  });
});
```

## Property-based testing

For anything with a clear invariant (parsers, serializers round-tripping, sorting, money math, idempotent operations), property-based testing with `fast-check` explores far more of the input space than hand-picked cases and shrinks failures to a minimal counterexample.

```typescript
import fc from 'fast-check';

it('serialize→deserialize is identity', () => {
  fc.assert(
    fc.property(orderArbitrary, (order) => {
      expect(deserialize(serialize(order))).toEqual(order);
    }),
  );
});

it('discounted price is never above list price and never negative', () => {
  fc.assert(
    fc.property(fc.nat(1000), fc.nat(10_000), (qty, unit) => {
      const p = calculateTierPrice({ qty, unit });
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(qty * unit);
    }),
  );
});
```

Reach for this on the algorithms that matter; it often surfaces edge cases (zero, overflow, unicode, duplicates) you'd never enumerate by hand.

## NestJS services in isolation

Use `Test.createTestingModule` so DI works, then provide test doubles only for the boundaries you don't own or that are slow/nondeterministic. Keep owned pure collaborators real.

```typescript
import { Test } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PaymentGateway } from './payment.gateway';   // unowned, external → fake
import { OrderRepository } from './order.repository';  // touches DB → see note

describe('OrdersService.checkout', () => {
  let service: OrdersService;
  let payments: { charge: ReturnType<typeof vi.fn> };
  let repo: { save: ReturnType<typeof vi.fn>; findCart: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    payments = { charge: vi.fn() };
    repo = { save: vi.fn(), findCart: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PaymentGateway, useValue: payments },
        { provide: OrderRepository, useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('rejects checkout when the cart is empty', async () => {
    repo.findCart.mockResolvedValue({ items: [] });
    await expect(service.checkout('cart-1')).rejects.toThrow(/empty/i);
    expect(payments.charge).not.toHaveBeenCalled(); // no charge on invalid state
  });

  it('does not persist the order if payment fails', async () => {
    repo.findCart.mockResolvedValue({ items: [{ sku: 'A', qty: 1, price: 100 }] });
    payments.charge.mockRejectedValue(new Error('declined'));
    await expect(service.checkout('cart-1')).rejects.toThrow('declined');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
```

**Important:** this unit-level test mocks the repository to test *orchestration* logic (what happens on empty cart, on payment failure). It does **not** verify the SQL or DB behavior — that's an integration test's job (`references/integration-testing.md`). If a service's whole job is data access with little branching, skip the mocked unit test and test it for real against Postgres.

**Testing guards / interceptors / pipes** in isolation: construct the class directly, build a fake `ExecutionContext`/`ArgumentsHost`, and assert the decision. This is faster than booting a module when the logic is self-contained:

```typescript
const ctx = {
  switchToHttp: () => ({ getRequest: () => ({ user: { role: 'MEMBER' } }) }),
  getHandler: () => handler,
  getClass: () => MyController,
} as unknown as ExecutionContext;

expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
```

For the full request pipeline (guard + pipe + filter together), prefer an e2e/API test instead.

## Mocking discipline

Every mock is an *unverified assumption* about a dependency. The more you mock, the more your green suite can diverge from reality.

- **Fake the unowned, slow, or nondeterministic:** payment gateways, email/SMS, third-party HTTP, the clock, randomness, the current user/principal.
- **Keep real:** your own pure functions, value objects, mappers, in-memory collaborators. Wiring three real owned services together in a unit test is fine and far more valuable than three mocks.
- **Never mock the database to test DB logic.** Use Testcontainers.
- **Prefer fakes over mocks where behavior matters.** A small in-memory fake implementing the same interface (e.g. an in-memory repo with a real `Map`) catches more than a `vi.fn()` returning canned values, because it has actual behavior.
- **Assert on outcomes, not call counts** — except when the call *is* the contract (an audit entry was written, an email was queued). `toHaveBeenCalledWith` on internal collaborators couples the test to implementation.

## Controlling time and randomness

Determinism requires the clock and RNG to be injectable.

```typescript
// Inject a Clock provider in production code; in tests pass a fixed one,
// or use Vitest fake timers for code that calls Date/ setTimeout directly:
vi.useFakeTimers();
vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
// ...exercise code...
vi.advanceTimersByTime(60_000);
vi.useRealTimers();
```

For randomness, inject a `() => number` (or an id generator) so tests can supply a deterministic sequence. Never assert on real `Math.random()` or real UUIDs.

## React component tests

Use Testing Library with a jsdom environment (a separate Vitest project so node and jsdom configs don't clash). Test what the user observes — rendered text, roles, interactions — not props or internal state.

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartSummary } from './CartSummary';

it('disables checkout when the cart is empty', async () => {
  render(<CartSummary items={[]} />);
  expect(screen.getByRole('button', { name: /checkout/i })).toBeDisabled();
});

it('shows the total and enables checkout with items', async () => {
  render(<CartSummary items={[{ sku: 'A', qty: 2, price: 100 }]} />);
  expect(screen.getByText('₾200')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /checkout/i }));
  // assert the observable effect (callback fired, route pushed, etc.)
});
```

- **Query by role/label/text**, not by test-id or class, so tests track what users and assistive tech actually perceive. Use `getByTestId` only as a last resort.
- **Mock the network at the boundary** with MSW (Mock Service Worker) rather than stubbing `fetch` ad hoc — MSW intercepts real requests and is reusable across component and e2e tests.
- **Don't test Server Components' data fetching here** — that belongs in integration/e2e where the real data layer runs. Component tests are for client-side rendering and interaction. See `references/e2e-testing.md` for Next.js Server Actions and data-flow testing.
