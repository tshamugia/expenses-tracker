/**
 * ExtraTracker API Integration Tests
 *
 * Uses Elysia's built-in .handle() method for request simulation -- no running
 * server required. Tests that touch the database are guarded behind a
 * DATABASE_URL check so the suite can still run in CI without a live DB.
 *
 * Run: pnpm --filter api run test
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { bearer } from '@elysiajs/bearer'
import { swagger } from '@elysiajs/swagger'

// ── Local imports from the API source ────────────────────────────────────────
import { ok, fail, ERROR_CODES } from '../utils/response'
import { authRoutes } from '../routes/auth.routes'
import { currencyRoutes } from '../routes/currency.routes'
import { settingsRoutes } from '../routes/settings.routes'
import { categoryRoutes } from '../routes/category.routes'
import { paymentCardRoutes } from '../routes/payment-card.routes'
import { notificationRoutes } from '../routes/notification.routes'
import { expenseRoutes } from '../routes/expense.routes'
import { dashboardRoutes } from '../routes/dashboard.routes'

// ── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** Type-safe json extraction from Response (bun-types returns unknown). */
async function json(response: Response): Promise<Json> {
  return response.json() as Promise<Json>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const HAS_DATABASE = Boolean(process.env.DATABASE_URL)
const BASE_URL = 'http://localhost'

/** Generate a unique test email to prevent collisions between runs. */
function testEmail(): string {
  return `test-${crypto.randomUUID()}@example.com`
}

const TEST_PASSWORD = 'SecurePassword123!'

/**
 * Build a fresh Elysia app instance **without** the rate limiter so that
 * individual test suites do not interfere with one another.
 *
 * The rate-limit middleware is tested separately via a purpose-built instance.
 */
function createTestApp() {
  const jwtPlugin = new Elysia({ name: 'plugin/jwt' }).use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET ?? 'test-jwt-secret-for-tests',
      exp: '15m',
    })
  )

  const app = new Elysia()
    .use(
      cors({
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
      })
    )
    .use(jwtPlugin)
    .use(bearer())
    .use(
      swagger({
        path: '/swagger',
        documentation: {
          info: { title: 'ExtraTracker API - Test', version: '0.1.0' },
        },
      })
    )
    .onError(({ code, error, set }) => {
      // Handle auth middleware errors that may bubble up as UNKNOWN.
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === ERROR_CODES.UNAUTHORIZED) {
        set.status = 401
        return { success: false, error: 'Authentication required', code: ERROR_CODES.UNAUTHORIZED }
      }
      if (errorMessage === ERROR_CODES.TOKEN_INVALID) {
        set.status = 401
        return { success: false, error: 'Invalid or expired token', code: ERROR_CODES.TOKEN_INVALID }
      }

      switch (code) {
        case 'VALIDATION':
          set.status = 422
          return fail(error.message, ERROR_CODES.VALIDATION_ERROR)
        case 'NOT_FOUND':
          set.status = 404
          return fail('Route not found', ERROR_CODES.NOT_FOUND)
        case 'PARSE':
          set.status = 400
          return fail('Invalid request body', ERROR_CODES.VALIDATION_ERROR)
        default:
          set.status = 500
          return fail('Internal server error', ERROR_CODES.INTERNAL_ERROR)
      }
    })
    .get('/health', () => ({ status: 'ok' }))
    .use(authRoutes)
    .use(currencyRoutes)
    .use(settingsRoutes)
    .use(categoryRoutes)
    .use(paymentCardRoutes)
    .use(notificationRoutes)
    .use(expenseRoutes)
    .use(dashboardRoutes)

  return app
}

/** Build a Request with common defaults. */
function makeRequest(
  path: string,
  options: {
    method?: string
    body?: unknown
    token?: string
    headers?: Record<string, string>
  } = {}
): Request {
  const { method = 'GET', body, token, headers = {} } = options

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`
  }

  return new Request(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Test App ─────────────────────────────────────────────────────────────────

let app: ReturnType<typeof createTestApp>

beforeAll(() => {
  app = createTestApp()
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  1. HEALTH CHECK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Health Check', () => {
  test('GET /health returns 200 with status ok', async () => {
    const response = await app.handle(makeRequest('/health'))
    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data).toEqual({ status: 'ok' })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  2. GLOBAL ERROR HANDLING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Global Error Handling', () => {
  test('GET /nonexistent returns 404', async () => {
    const response = await app.handle(makeRequest('/this-route-does-not-exist'))
    expect(response.status).toBe(404)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.NOT_FOUND)
  })

  test('POST with invalid JSON returns 400 or 422', async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json',
      })
    )
    // Elysia may return 400 (PARSE) or 422 (VALIDATION) depending on how
    // it interprets the payload; either is acceptable for malformed JSON.
    expect([400, 422]).toContain(response.status)

    const data = await json(response)
    expect(data.success).toBe(false)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  3. VALIDATION ERRORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Input Validation', () => {
  test('POST /auth/register rejects missing email', async () => {
    const response = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: { password: TEST_PASSWORD },
      })
    )
    expect(response.status).toBe(422)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })

  test('POST /auth/register rejects missing password', async () => {
    const response = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: { email: testEmail() },
      })
    )
    expect(response.status).toBe(422)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /auth/register rejects invalid email format', async () => {
    const response = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: { email: 'not-an-email', password: TEST_PASSWORD },
      })
    )
    expect(response.status).toBe(422)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /auth/register rejects short password (< 8 chars)', async () => {
    const response = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: { email: testEmail(), password: 'short' },
      })
    )
    expect(response.status).toBe(422)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /auth/login rejects missing fields', async () => {
    const response = await app.handle(
      makeRequest('/auth/login', {
        method: 'POST',
        body: {},
      })
    )
    expect(response.status).toBe(422)
  })

  test('POST /auth/verify-code rejects non-numeric code', async () => {
    const response = await app.handle(
      makeRequest('/auth/verify-code', {
        method: 'POST',
        body: { email: testEmail(), code: 'abcdef' },
      })
    )
    expect(response.status).toBe(422)
  })

  test('POST /auth/verify-code rejects short code', async () => {
    const response = await app.handle(
      makeRequest('/auth/verify-code', {
        method: 'POST',
        body: { email: testEmail(), code: '123' },
      })
    )
    expect(response.status).toBe(422)
  })

  test('POST /auth/reset-password rejects short newPassword', async () => {
    const response = await app.handle(
      makeRequest('/auth/reset-password', {
        method: 'POST',
        body: { email: testEmail(), code: '123456', newPassword: 'short' },
      })
    )
    expect(response.status).toBe(422)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  4. AUTHENTICATION GUARD - UNAUTHENTICATED ACCESS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Auth Guard (unauthenticated access)', () => {
  const protectedRoutes: Array<{ method: string; path: string; body?: unknown }> = [
    { method: 'GET', path: '/expenses' },
    { method: 'GET', path: '/categories' },
    { method: 'GET', path: '/payment-cards' },
    { method: 'GET', path: '/notifications' },
    { method: 'GET', path: '/notifications/stats' },
    { method: 'GET', path: '/dashboard' },
    { method: 'GET', path: '/settings' },
    { method: 'POST', path: '/auth/logout', body: { refreshToken: 'fake' } },
    {
      method: 'POST',
      path: '/auth/change-password',
      body: { currentPassword: 'a', newPassword: 'b' },
    },
  ]

  for (const route of protectedRoutes) {
    test(`${route.method} ${route.path} returns 401 without token`, async () => {
      const response = await app.handle(
        makeRequest(route.path, {
          method: route.method,
          body: route.body,
        })
      )
      expect(response.status).toBe(401)

      const data = await json(response)
      expect(data.success).toBe(false)
      expect(data.code).toMatch(/UNAUTHORIZED|TOKEN_INVALID/)
    })
  }

  test('Protected route returns 401 with invalid JWT', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        token: 'this.is.not.a.valid.jwt',
      })
    )
    expect(response.status).toBe(401)

    const data = await json(response)
    expect(data.success).toBe(false)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  5. CURRENCY ROUTES (PUBLIC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Currency Routes (public)', () => {
  test('GET /currency/rates returns 200 or 500 (network-dependent)', async () => {
    const response = await app.handle(makeRequest('/currency/rates'))
    // The endpoint fetches live rates; it may fail in some CI environments
    // without network access. We accept either 200 or 500.
    expect([200, 500]).toContain(response.status)

    const data = await json(response)
    if (response.status === 200) {
      expect(data.success).toBe(true)
      expect(data.data).toBeDefined()
    } else {
      expect(data.success).toBe(false)
    }
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  6. RATE LIMITING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Rate Limiting', () => {
  test('Auth endpoint returns 429 after exceeding limit', async () => {
    const { rateLimitMiddleware } = await import('../middleware/rate-limit')

    const jwtPlugin = new Elysia({ name: 'plugin/jwt' }).use(
      jwt({
        name: 'jwt',
        secret: 'test-secret-for-rate-limit',
        exp: '15m',
      })
    )

    const rateLimitedApp = new Elysia()
      .use(
        rateLimitMiddleware({
          general: { maxRequests: 100, windowSeconds: 60 },
          auth: { maxRequests: 3, windowSeconds: 60 }, // very low for testing
          passwordReset: { maxRequests: 2, windowSeconds: 60 },
          cleanupIntervalMs: 300_000,
        })
      )
      .use(jwtPlugin)
      .use(bearer())
      .onError(({ code, error, set }) => {
        if (code === 'VALIDATION') {
          set.status = 422
          return fail(error.message, ERROR_CODES.VALIDATION_ERROR)
        }
        set.status = 500
        return fail('Internal server error', ERROR_CODES.INTERNAL_ERROR)
      })
      .use(authRoutes)

    // Send sequential requests (not parallel) to ensure ordering.
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) {
      const res = await rateLimitedApp.handle(
        new Request(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.100.1',
          },
          body: JSON.stringify({
            email: `rl-${i}@example.com`,
            password: 'SomePassword123!',
          }),
        })
      )
      statuses.push(res.status)

      // If we already got a 429, verify its shape and break early.
      if (res.status === 429) {
        const body = await json(res)
        expect(body.success).toBe(false)
        expect(body.code).toBe(ERROR_CODES.RATE_LIMITED)
        break
      }
    }

    // At least one should be 429 (the 4th request at the latest).
    expect(statuses).toContain(429)
  })

  test('Password reset endpoint returns 429 after exceeding limit', async () => {
    const { rateLimitMiddleware } = await import('../middleware/rate-limit')

    const jwtPlugin = new Elysia({ name: 'plugin/jwt' }).use(
      jwt({
        name: 'jwt',
        secret: 'test-secret-for-rate-limit-2',
        exp: '15m',
      })
    )

    const rateLimitedApp = new Elysia()
      .use(
        rateLimitMiddleware({
          general: { maxRequests: 100, windowSeconds: 60 },
          auth: { maxRequests: 10, windowSeconds: 60 },
          passwordReset: { maxRequests: 2, windowSeconds: 60 },
          cleanupIntervalMs: 300_000,
        })
      )
      .use(jwtPlugin)
      .use(bearer())
      .onError(({ code, error, set }) => {
        if (code === 'VALIDATION') {
          set.status = 422
          return fail(error.message, ERROR_CODES.VALIDATION_ERROR)
        }
        set.status = 500
        return fail('Internal server error', ERROR_CODES.INTERNAL_ERROR)
      })
      .use(authRoutes)

    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await rateLimitedApp.handle(
        new Request(`${BASE_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.200.1',
          },
          body: JSON.stringify({ email: `pwreset-${i}@example.com` }),
        })
      )
      statuses.push(res.status)
    }

    expect(statuses).toContain(429)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DATABASE-DEPENDENT INTEGRATION TESTS
//
//  Everything below requires a live database. Each describe block is wrapped
//  in a conditional so that tests are skipped gracefully when DATABASE_URL is
//  not set.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Helper that conditionally defines a describe block.
const describeWithDB: typeof describe =
  HAS_DATABASE ? describe : (describe.skip as unknown as typeof describe)

// ── Shared state across database-dependent tests ─────────────────────────────

let testUserEmail: string
let testUserPassword: string
let accessToken: string
let refreshToken: string
let testUserId: string

// IDs created during CRUD tests so we can clean up.
let createdExpenseId: string
let createdCategoryId: string
let createdPaymentCardId: string
let createdNotificationId: string

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  7. AUTH FLOW (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Auth Flow (database)', () => {
  beforeAll(() => {
    testUserEmail = testEmail()
    testUserPassword = TEST_PASSWORD
  })

  test('POST /auth/register creates a new user', async () => {
    const response = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: {
          email: testUserEmail,
          password: testUserPassword,
          name: 'Test User',
        },
      })
    )

    expect(response.status).toBe(201)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.user.email).toBe(testUserEmail)
    expect(data.data.user.name).toBe('Test User')
    expect(data.data.user.id).toBeDefined()
    expect(data.data.accessToken).toBeDefined()
    expect(data.data.refreshToken).toBeDefined()

    // The response should NOT contain the password hash.
    expect(data.data.user.password).toBeUndefined()

    // Save for subsequent tests.
    accessToken = data.data.accessToken
    refreshToken = data.data.refreshToken
    testUserId = data.data.user.id
  })

  test('POST /auth/register rejects duplicate email', async () => {
    const response = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: {
          email: testUserEmail,
          password: testUserPassword,
        },
      })
    )

    expect(response.status).toBe(409)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.CONFLICT)
  })

  test('POST /auth/login succeeds with correct credentials', async () => {
    const response = await app.handle(
      makeRequest('/auth/login', {
        method: 'POST',
        body: {
          email: testUserEmail,
          password: testUserPassword,
        },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.user.email).toBe(testUserEmail)
    expect(data.data.accessToken).toBeDefined()
    expect(data.data.refreshToken).toBeDefined()

    // Use these fresh tokens going forward.
    accessToken = data.data.accessToken
    refreshToken = data.data.refreshToken
  })

  test('POST /auth/login rejects wrong password', async () => {
    const response = await app.handle(
      makeRequest('/auth/login', {
        method: 'POST',
        body: {
          email: testUserEmail,
          password: 'WrongPassword999!',
        },
      })
    )

    expect(response.status).toBe(401)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.INVALID_CREDENTIALS)
  })

  test('POST /auth/login rejects nonexistent email', async () => {
    const response = await app.handle(
      makeRequest('/auth/login', {
        method: 'POST',
        body: {
          email: testEmail(),
          password: 'SomePassword123!',
        },
      })
    )

    expect(response.status).toBe(401)
  })

  test('Authenticated route works with valid access token', async () => {
    const response = await app.handle(
      makeRequest('/settings', { token: accessToken })
    )
    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
  })

  test('POST /auth/refresh issues new token pair', async () => {
    const response = await app.handle(
      makeRequest('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.accessToken).toBeDefined()
    expect(data.data.refreshToken).toBeDefined()

    // The new tokens should be different from the old ones (rotation).
    expect(data.data.refreshToken).not.toBe(refreshToken)

    // Update tokens for subsequent tests.
    accessToken = data.data.accessToken
    refreshToken = data.data.refreshToken
  })

  test('POST /auth/refresh rejects already-revoked token', async () => {
    // First, use the current refresh token to get a new pair.
    const first = await app.handle(
      makeRequest('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      })
    )
    expect(first.status).toBe(200)

    const firstData = await json(first)
    accessToken = firstData.data.accessToken
    const newRefreshToken = firstData.data.refreshToken

    // Now the old refreshToken is revoked. Attempt to reuse it.
    const second = await app.handle(
      makeRequest('/auth/refresh', {
        method: 'POST',
        body: { refreshToken }, // the old, now-revoked one
      })
    )
    expect(second.status).toBe(401)

    const secondData = await json(second)
    expect(secondData.success).toBe(false)
    expect(secondData.code).toBe(ERROR_CODES.TOKEN_EXPIRED)

    // Keep the valid refresh token for subsequent tests.
    refreshToken = newRefreshToken
  })

  test('POST /auth/change-password succeeds', async () => {
    const newPassword = 'NewSecurePassword456!'

    const response = await app.handle(
      makeRequest('/auth/change-password', {
        method: 'POST',
        token: accessToken,
        body: {
          currentPassword: testUserPassword,
          newPassword,
        },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.message).toContain('Password changed')

    // Update the password for subsequent tests.
    testUserPassword = newPassword
  })

  test('POST /auth/change-password rejects wrong current password', async () => {
    const response = await app.handle(
      makeRequest('/auth/change-password', {
        method: 'POST',
        token: accessToken,
        body: {
          currentPassword: 'TotallyWrongPassword!',
          newPassword: 'AnotherPassword789!',
        },
      })
    )

    expect(response.status).toBe(401)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.INVALID_CREDENTIALS)
  })

  test('POST /auth/forgot-password returns 200 for any email (anti-enumeration)', async () => {
    const response = await app.handle(
      makeRequest('/auth/forgot-password', {
        method: 'POST',
        body: { email: testEmail() }, // nonexistent email
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.message).toContain('If an account exists')
  })

  test('POST /auth/forgot-password returns 200 for existing email', async () => {
    const response = await app.handle(
      makeRequest('/auth/forgot-password', {
        method: 'POST',
        body: { email: testUserEmail },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
  })

  test('POST /auth/verify-code returns 400 for invalid code', async () => {
    const response = await app.handle(
      makeRequest('/auth/verify-code', {
        method: 'POST',
        body: { email: testUserEmail, code: '000000' },
      })
    )

    expect(response.status).toBe(400)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /auth/reset-password returns 400 for invalid code', async () => {
    const response = await app.handle(
      makeRequest('/auth/reset-password', {
        method: 'POST',
        body: {
          email: testUserEmail,
          code: '000000',
          newPassword: 'ResetPassword123!',
        },
      })
    )

    expect(response.status).toBe(400)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /auth/logout revokes refresh token', async () => {
    // Re-login to get a fresh pair for this test.
    const loginRes = await app.handle(
      makeRequest('/auth/login', {
        method: 'POST',
        body: { email: testUserEmail, password: testUserPassword },
      })
    )
    const loginData = await json(loginRes)
    const logoutAccessToken = loginData.data.accessToken
    const logoutRefreshToken = loginData.data.refreshToken

    const response = await app.handle(
      makeRequest('/auth/logout', {
        method: 'POST',
        token: logoutAccessToken,
        body: { refreshToken: logoutRefreshToken },
      })
    )

    expect(response.status).toBe(204)

    // The refresh token should now be revoked.
    const refreshRes = await app.handle(
      makeRequest('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: logoutRefreshToken },
      })
    )
    expect(refreshRes.status).toBe(401)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  8. SETTINGS (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Settings (database)', () => {
  // Re-login before settings tests to ensure we have valid tokens.
  beforeAll(async () => {
    if (!testUserEmail) return

    const loginRes = await app.handle(
      makeRequest('/auth/login', {
        method: 'POST',
        body: { email: testUserEmail, password: testUserPassword },
      })
    )
    const loginData = await json(loginRes)
    accessToken = loginData.data.accessToken
    refreshToken = loginData.data.refreshToken
  })

  test('GET /settings returns defaults on first access', async () => {
    const response = await app.handle(
      makeRequest('/settings', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.emailEnabled).toBe(true)
    expect(data.data.theme).toBe('light')
    expect(data.data.defaultCurrency).toBe('GEL')
    expect(data.data.subscriptionPlan).toBe('free')
  })

  test('PATCH /settings updates theme and currency', async () => {
    const response = await app.handle(
      makeRequest('/settings', {
        method: 'PATCH',
        token: accessToken,
        body: { theme: 'dark', defaultCurrency: 'USD' },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.theme).toBe('dark')
    expect(data.data.defaultCurrency).toBe('USD')
  })

  test('PATCH /settings rejects invalid theme value', async () => {
    const response = await app.handle(
      makeRequest('/settings', {
        method: 'PATCH',
        token: accessToken,
        body: { theme: 'neon' },
      })
    )

    expect(response.status).toBe(422)
  })

  test('PATCH /settings rejects invalid currency value', async () => {
    const response = await app.handle(
      makeRequest('/settings', {
        method: 'PATCH',
        token: accessToken,
        body: { defaultCurrency: 'BTC' },
      })
    )

    expect(response.status).toBe(422)
  })

  test('PATCH /settings updates notification preferences', async () => {
    const response = await app.handle(
      makeRequest('/settings', {
        method: 'PATCH',
        token: accessToken,
        body: { emailEnabled: false, notifyBeforeDays: 7 },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.emailEnabled).toBe(false)
    expect(data.data.notifyBeforeDays).toBe(7)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  9. CATEGORY CRUD (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Category CRUD (database)', () => {
  const categoryName = `Test Category ${crypto.randomUUID().slice(0, 8)}`
  const categoryColor = '#ff5733'

  test('POST /categories creates a new category', async () => {
    const response = await app.handle(
      makeRequest('/categories', {
        method: 'POST',
        token: accessToken,
        body: { categoryName, color: categoryColor },
      })
    )

    expect(response.status).toBe(201)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.categoryName).toBe(categoryName)
    expect(data.data.color).toBe(categoryColor)
    expect(data.data.id).toBeDefined()

    createdCategoryId = data.data.id
  })

  test('POST /categories rejects duplicate name (case-insensitive)', async () => {
    const response = await app.handle(
      makeRequest('/categories', {
        method: 'POST',
        token: accessToken,
        body: { categoryName: categoryName.toUpperCase() },
      })
    )

    expect(response.status).toBe(409)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.CONFLICT)
  })

  test('POST /categories rejects missing categoryName', async () => {
    const response = await app.handle(
      makeRequest('/categories', {
        method: 'POST',
        token: accessToken,
        body: {},
      })
    )

    expect(response.status).toBe(422)
  })

  test('POST /categories rejects invalid color format', async () => {
    const response = await app.handle(
      makeRequest('/categories', {
        method: 'POST',
        token: accessToken,
        body: { categoryName: 'Temp Cat', color: 'not-hex' },
      })
    )

    expect(response.status).toBe(422)
  })

  test('GET /categories returns paginated list', async () => {
    const response = await app.handle(
      makeRequest('/categories', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data.data)).toBe(true)
    expect(data.data.total).toBeGreaterThanOrEqual(1)
    expect(data.data.page).toBe(1)
    expect(data.data.pageSize).toBeDefined()
    expect(data.data.totalPages).toBeGreaterThanOrEqual(1)
  })

  test('GET /categories/:id returns the category', async () => {
    const response = await app.handle(
      makeRequest(`/categories/${createdCategoryId}`, { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe(createdCategoryId)
    expect(data.data.categoryName).toBe(categoryName)
  })

  test('GET /categories/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/categories/${fakeId}`, { token: accessToken })
    )

    expect(response.status).toBe(404)

    const data = await json(response)
    expect(data.success).toBe(false)
    expect(data.code).toBe(ERROR_CODES.NOT_FOUND)
  })

  test('PATCH /categories/:id updates the category', async () => {
    const updatedName = `Updated ${categoryName}`
    const response = await app.handle(
      makeRequest(`/categories/${createdCategoryId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { categoryName: updatedName, color: '#00ff00' },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.categoryName).toBe(updatedName)
    expect(data.data.color).toBe('#00ff00')
  })

  test('PATCH /categories/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/categories/${fakeId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { categoryName: 'Does Not Exist' },
      })
    )

    expect(response.status).toBe(404)
  })

  test('DELETE /categories/:id deletes the category', async () => {
    const response = await app.handle(
      makeRequest(`/categories/${createdCategoryId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(204)

    // Confirm it is gone.
    const getRes = await app.handle(
      makeRequest(`/categories/${createdCategoryId}`, { token: accessToken })
    )
    expect(getRes.status).toBe(404)
  })

  test('DELETE /categories/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/categories/${fakeId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(404)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. PAYMENT CARD CRUD (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Payment Card CRUD (database)', () => {
  // Valid Visa test card number (passes Luhn check).
  const validCardNumber = '4111111111111111'
  const futureYear = new Date().getFullYear() + 3

  test('POST /payment-cards creates a new card', async () => {
    const response = await app.handle(
      makeRequest('/payment-cards', {
        method: 'POST',
        token: accessToken,
        body: {
          cardholderName: 'Test User',
          cardNumber: validCardNumber,
          expiryMonth: 12,
          expiryYear: futureYear,
          nickname: 'My Test Card',
          color: '#e11d48',
        },
      })
    )

    expect(response.status).toBe(201)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.cardholderName).toBe('Test User')
    expect(data.data.lastFourDigits).toBe('1111')
    expect(data.data.cardBrand).toBe('Visa')
    expect(data.data.nickname).toBe('My Test Card')
    expect(data.data.expiryMonth).toBe(12)
    expect(data.data.expiryYear).toBe(futureYear)

    // Full card number should never appear in the response.
    expect(JSON.stringify(data)).not.toContain(validCardNumber)

    createdPaymentCardId = data.data.id
  })

  test('POST /payment-cards rejects invalid card number (Luhn)', async () => {
    const response = await app.handle(
      makeRequest('/payment-cards', {
        method: 'POST',
        token: accessToken,
        body: {
          cardholderName: 'Test User',
          cardNumber: '1234567890123456', // fails Luhn
          expiryMonth: 12,
          expiryYear: futureYear,
        },
      })
    )

    expect(response.status).toBe(422)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /payment-cards rejects expired card', async () => {
    const response = await app.handle(
      makeRequest('/payment-cards', {
        method: 'POST',
        token: accessToken,
        body: {
          cardholderName: 'Test User',
          cardNumber: validCardNumber,
          expiryMonth: 1,
          expiryYear: 2020,
        },
      })
    )

    expect(response.status).toBe(422)

    const data = await json(response)
    expect(data.success).toBe(false)
  })

  test('POST /payment-cards rejects missing cardholderName', async () => {
    const response = await app.handle(
      makeRequest('/payment-cards', {
        method: 'POST',
        token: accessToken,
        body: {
          cardNumber: validCardNumber,
          expiryMonth: 12,
          expiryYear: futureYear,
        },
      })
    )

    expect(response.status).toBe(422)
  })

  test('GET /payment-cards returns paginated list', async () => {
    const response = await app.handle(
      makeRequest('/payment-cards', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data.data)).toBe(true)
    expect(data.data.total).toBeGreaterThanOrEqual(1)
    expect(data.data.page).toBe(1)
  })

  test('GET /payment-cards/:id returns the card with expense count', async () => {
    const response = await app.handle(
      makeRequest(`/payment-cards/${createdPaymentCardId}`, {
        token: accessToken,
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe(createdPaymentCardId)
    expect(data.data._count).toBeDefined()
  })

  test('GET /payment-cards/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/payment-cards/${fakeId}`, { token: accessToken })
    )

    expect(response.status).toBe(404)
  })

  test('PATCH /payment-cards/:id updates card details', async () => {
    const response = await app.handle(
      makeRequest(`/payment-cards/${createdPaymentCardId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { nickname: 'Updated Card Name', color: '#3b82f6' },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.nickname).toBe('Updated Card Name')
    expect(data.data.color).toBe('#3b82f6')
  })

  test('PATCH /payment-cards/:id rejects expired expiry update', async () => {
    const response = await app.handle(
      makeRequest(`/payment-cards/${createdPaymentCardId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { expiryMonth: 1, expiryYear: 2020 },
      })
    )

    expect(response.status).toBe(422)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. EXPENSE CRUD (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Expense CRUD (database)', () => {
  test('POST /expenses creates a new expense', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)

    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: {
          title: 'Test Expense',
          amount: 99.99,
          currency: 'GEL',
          description: 'Integration test expense',
          category: 'Test',
          isRecurring: false,
          nextDueDate: futureDate.toISOString(),
          paymentCardId: createdPaymentCardId,
        },
      })
    )

    expect(response.status).toBe(201)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.title).toBe('Test Expense')
    expect(data.data.amount).toBe(99.99)
    expect(data.data.currency).toBe('GEL')
    expect(data.data.description).toBe('Integration test expense')
    expect(data.data.isRecurring).toBe(false)
    expect(data.data.payments).toBeDefined()
    expect(Array.isArray(data.data.payments)).toBe(true)

    createdExpenseId = data.data.id
  })

  test('POST /expenses with minimal fields (title + amount)', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: {
          title: 'Minimal Expense',
          amount: 10.0,
        },
      })
    )

    expect(response.status).toBe(201)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.currency).toBe('GEL') // default
  })

  test('POST /expenses rejects missing title', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: { amount: 50 },
      })
    )

    expect(response.status).toBe(422)
  })

  test('POST /expenses rejects missing amount', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: { title: 'No Amount' },
      })
    )

    expect(response.status).toBe(422)
  })

  test('POST /expenses rejects zero amount', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: { title: 'Zero', amount: 0 },
      })
    )

    expect(response.status).toBe(422)
  })

  test('POST /expenses rejects negative amount', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: { title: 'Negative', amount: -10 },
      })
    )

    expect(response.status).toBe(422)
  })

  test('POST /expenses rejects invalid currency', async () => {
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: { title: 'Bad Currency', amount: 10, currency: 'BTC' },
      })
    )

    expect(response.status).toBe(422)
  })

  test('POST /expenses rejects nonexistent paymentCardId', async () => {
    const fakeCardId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: {
          title: 'Bad Card',
          amount: 10,
          paymentCardId: fakeCardId,
        },
      })
    )

    expect(response.status).toBe(404)
  })

  test('GET /expenses returns paginated list', async () => {
    const response = await app.handle(
      makeRequest('/expenses', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data.data)).toBe(true)
    expect(data.data.total).toBeGreaterThanOrEqual(1)
    expect(data.data.page).toBe(1)
    expect(data.data.pageSize).toBeDefined()
    expect(data.data.totalPages).toBeGreaterThanOrEqual(1)
  })

  test('GET /expenses supports pagination parameters', async () => {
    const response = await app.handle(
      makeRequest('/expenses?page=1&pageSize=5', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.pageSize).toBe(5)
    expect(data.data.data.length).toBeLessThanOrEqual(5)
  })

  test('GET /expenses/:id returns the expense', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${createdExpenseId}`, { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe(createdExpenseId)
    expect(data.data.title).toBe('Test Expense')
    expect(data.data.amount).toBe(99.99)
    // Payments should be serialized with numeric amounts.
    if (data.data.payments.length > 0) {
      expect(typeof data.data.payments[0].amount).toBe('number')
    }
  })

  test('GET /expenses/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/expenses/${fakeId}`, { token: accessToken })
    )

    expect(response.status).toBe(404)
  })

  test('PATCH /expenses/:id updates the expense', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${createdExpenseId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { title: 'Updated Test Expense', amount: 150.0 },
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.title).toBe('Updated Test Expense')
    expect(data.data.amount).toBe(150.0)
  })

  test('PATCH /expenses/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/expenses/${fakeId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { title: 'Ghost' },
      })
    )

    expect(response.status).toBe(404)
  })

  test('POST /expenses/:id/mark-paid marks the earliest unpaid payment', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${createdExpenseId}/mark-paid`, {
        method: 'POST',
        token: accessToken,
      })
    )

    // Might be 200 (payment found and marked) or 422 (no unpaid payments).
    expect([200, 422]).toContain(response.status)

    const data = await json(response)
    if (response.status === 200) {
      expect(data.success).toBe(true)
    }
  })

  test('POST /expenses/:id/mark-paid returns 404 for nonexistent expense', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/expenses/${fakeId}/mark-paid`, {
        method: 'POST',
        token: accessToken,
      })
    )

    expect(response.status).toBe(404)
  })

  test('DELETE /expenses/:id deletes the expense', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${createdExpenseId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(204)

    // Confirm it is gone.
    const getRes = await app.handle(
      makeRequest(`/expenses/${createdExpenseId}`, { token: accessToken })
    )
    expect(getRes.status).toBe(404)
  })

  test('DELETE /expenses/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/expenses/${fakeId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(404)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. NOTIFICATION ENDPOINTS (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Notification Endpoints (database)', () => {
  // Create a notification manually via Prisma to test with.
  beforeAll(async () => {
    if (!HAS_DATABASE || !testUserId) return

    const { prisma } = await import('@extracker/db')
    const notification = await prisma.notification.create({
      data: {
        userId: testUserId,
        title: 'Test Notification',
        message: 'This is a test notification for integration tests',
        type: 'info',
        isRead: false,
        actionUrl: '/expenses',
      },
    })
    createdNotificationId = notification.id
  })

  test('GET /notifications returns paginated list', async () => {
    const response = await app.handle(
      makeRequest('/notifications', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data.data)).toBe(true)
    expect(data.data.total).toBeGreaterThanOrEqual(1)
    expect(data.data.page).toBe(1)
  })

  test('GET /notifications/stats returns total and unread counts', async () => {
    const response = await app.handle(
      makeRequest('/notifications/stats', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(typeof data.data.total).toBe('number')
    expect(typeof data.data.unread).toBe('number')
    expect(data.data.unread).toBeGreaterThanOrEqual(1)
  })

  test('GET /notifications/:id returns a single notification', async () => {
    const response = await app.handle(
      makeRequest(`/notifications/${createdNotificationId}`, {
        token: accessToken,
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe(createdNotificationId)
    expect(data.data.title).toBe('Test Notification')
    expect(data.data.isRead).toBe(false)
  })

  test('GET /notifications/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/notifications/${fakeId}`, { token: accessToken })
    )

    expect(response.status).toBe(404)
  })

  test('PATCH /notifications/:id/read marks as read', async () => {
    const response = await app.handle(
      makeRequest(`/notifications/${createdNotificationId}/read`, {
        method: 'PATCH',
        token: accessToken,
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(data.data.isRead).toBe(true)
  })

  test('PATCH /notifications/:id/read returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/notifications/${fakeId}/read`, {
        method: 'PATCH',
        token: accessToken,
      })
    )

    expect(response.status).toBe(404)
  })

  test('POST /notifications/read-all marks all as read', async () => {
    // First create another unread notification.
    const { prisma } = await import('@extracker/db')
    await prisma.notification.create({
      data: {
        userId: testUserId,
        title: 'Another Notification',
        message: 'Unread notification',
        type: 'info',
        isRead: false,
      },
    })

    const response = await app.handle(
      makeRequest('/notifications/read-all', {
        method: 'POST',
        token: accessToken,
      })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)
    expect(typeof data.data.updated).toBe('number')

    // Verify: unread count should now be 0.
    const statsRes = await app.handle(
      makeRequest('/notifications/stats', { token: accessToken })
    )
    const statsData = await json(statsRes)
    expect(statsData.data.unread).toBe(0)
  })

  test('DELETE /notifications/:id deletes a single notification', async () => {
    // Create a throwaway notification to delete.
    const { prisma } = await import('@extracker/db')
    const tempNotification = await prisma.notification.create({
      data: {
        userId: testUserId,
        title: 'To Delete',
        message: 'Will be deleted',
        type: 'info',
      },
    })

    const response = await app.handle(
      makeRequest(`/notifications/${tempNotification.id}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(204)

    // Confirm it is gone.
    const getRes = await app.handle(
      makeRequest(`/notifications/${tempNotification.id}`, {
        token: accessToken,
      })
    )
    expect(getRes.status).toBe(404)
  })

  test('DELETE /notifications/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/notifications/${fakeId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(404)
  })

  test('DELETE /notifications/read deletes all read notifications', async () => {
    // All notifications should be read at this point (from read-all test).
    const response = await app.handle(
      makeRequest('/notifications/read', {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(204)

    // Verify: total count should be 0.
    const statsRes = await app.handle(
      makeRequest('/notifications/stats', { token: accessToken })
    )
    const statsData = await json(statsRes)
    expect(statsData.data.total).toBe(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. DASHBOARD (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Dashboard (database)', () => {
  test('GET /dashboard returns expected shape', async () => {
    const response = await app.handle(
      makeRequest('/dashboard', { token: accessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)

    // Verify top-level keys.
    expect(data.data.expenses).toBeDefined()
    expect(Array.isArray(data.data.expenses)).toBe(true)

    expect(data.data.stats).toBeDefined()
    expect(typeof data.data.stats.total).toBe('number')
    expect(typeof data.data.stats.paid).toBe('number')
    expect(typeof data.data.stats.pending).toBe('number')
    expect(typeof data.data.stats.overdue).toBe('number')
    expect(typeof data.data.stats.count).toBe('number')

    expect(data.data.upcomingExpenses).toBeDefined()
    expect(Array.isArray(data.data.upcomingExpenses)).toBe(true)

    expect(data.data.categoryData).toBeDefined()
    expect(Array.isArray(data.data.categoryData)).toBe(true)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. CROSS-USER ISOLATION (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Cross-User Isolation (database)', () => {
  let otherAccessToken: string
  let isolationExpenseId: string
  let isolationCategoryId: string

  beforeAll(async () => {
    // Register a second user.
    const otherEmail = testEmail()
    const otherPassword = 'OtherUserPass123!'

    const regRes = await app.handle(
      makeRequest('/auth/register', {
        method: 'POST',
        body: { email: otherEmail, password: otherPassword, name: 'Other User' },
      })
    )
    const regData = await json(regRes)
    otherAccessToken = regData.data.accessToken

    // Create a category and expense belonging to the FIRST test user.
    const catRes = await app.handle(
      makeRequest('/categories', {
        method: 'POST',
        token: accessToken,
        body: { categoryName: `Isolated Cat ${crypto.randomUUID().slice(0, 6)}` },
      })
    )
    const catData = await json(catRes)
    isolationCategoryId = catData.data.id

    const expRes = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: { title: 'Isolated Expense', amount: 42.0 },
      })
    )
    const expData = await json(expRes)
    isolationExpenseId = expData.data.id
  })

  test('User B cannot read User A expense', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${isolationExpenseId}`, {
        token: otherAccessToken,
      })
    )
    expect(response.status).toBe(404)
  })

  test('User B cannot update User A expense', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${isolationExpenseId}`, {
        method: 'PATCH',
        token: otherAccessToken,
        body: { title: 'Hacked' },
      })
    )
    expect(response.status).toBe(404)
  })

  test('User B cannot delete User A expense', async () => {
    const response = await app.handle(
      makeRequest(`/expenses/${isolationExpenseId}`, {
        method: 'DELETE',
        token: otherAccessToken,
      })
    )
    expect(response.status).toBe(404)
  })

  test('User B cannot read User A category', async () => {
    const response = await app.handle(
      makeRequest(`/categories/${isolationCategoryId}`, {
        token: otherAccessToken,
      })
    )
    expect(response.status).toBe(404)
  })

  test('User B cannot delete User A category', async () => {
    const response = await app.handle(
      makeRequest(`/categories/${isolationCategoryId}`, {
        method: 'DELETE',
        token: otherAccessToken,
      })
    )
    expect(response.status).toBe(404)
  })

  test('User B expenses list is independent of User A', async () => {
    const response = await app.handle(
      makeRequest('/expenses', { token: otherAccessToken })
    )

    expect(response.status).toBe(200)

    const data = await json(response)
    expect(data.success).toBe(true)

    // User B should have 0 expenses.
    expect(data.data.total).toBe(0)
    expect(data.data.data.length).toBe(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 15. PAYMENT CARD DELETION (DB REQUIRED) - after expense tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Payment Card Deletion (database)', () => {
  test('DELETE /payment-cards/:id deletes the card', async () => {
    if (!createdPaymentCardId) return

    const response = await app.handle(
      makeRequest(`/payment-cards/${createdPaymentCardId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(204)

    // Confirm it is gone.
    const getRes = await app.handle(
      makeRequest(`/payment-cards/${createdPaymentCardId}`, {
        token: accessToken,
      })
    )
    expect(getRes.status).toBe(404)
  })

  test('DELETE /payment-cards/:id returns 404 for nonexistent id', async () => {
    const fakeId = crypto.randomUUID()
    const response = await app.handle(
      makeRequest(`/payment-cards/${fakeId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(response.status).toBe(404)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 16. CATEGORY-EXPENSE DEPENDENCY (DB REQUIRED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Category-Expense Dependency (database)', () => {
  let depCategoryId: string
  let depExpenseId: string
  const depCategoryName = `DepCat ${crypto.randomUUID().slice(0, 6)}`

  test('Cannot delete category used by an expense', async () => {
    // Create a category.
    const catRes = await app.handle(
      makeRequest('/categories', {
        method: 'POST',
        token: accessToken,
        body: { categoryName: depCategoryName },
      })
    )
    const catData = await json(catRes)
    expect(catRes.status).toBe(201)
    depCategoryId = catData.data.id

    // Create an expense referencing that category name.
    const expRes = await app.handle(
      makeRequest('/expenses', {
        method: 'POST',
        token: accessToken,
        body: {
          title: 'Dep Expense',
          amount: 20,
          category: depCategoryName,
        },
      })
    )
    const expData = await json(expRes)
    expect(expRes.status).toBe(201)
    depExpenseId = expData.data.id

    // Attempt to delete the category -- should be blocked.
    const delRes = await app.handle(
      makeRequest(`/categories/${depCategoryId}`, {
        method: 'DELETE',
        token: accessToken,
      })
    )

    expect(delRes.status).toBe(409)

    const delData = await json(delRes)
    expect(delData.success).toBe(false)
    expect(delData.code).toBe(ERROR_CODES.CONFLICT)
    expect(delData.error).toContain('expense')
  })

  // Clean up: delete the expense first, then the category.
  afterAll(async () => {
    if (!HAS_DATABASE) return

    if (depExpenseId) {
      await app.handle(
        makeRequest(`/expenses/${depExpenseId}`, {
          method: 'DELETE',
          token: accessToken,
        })
      )
    }
    if (depCategoryId) {
      await app.handle(
        makeRequest(`/categories/${depCategoryId}`, {
          method: 'DELETE',
          token: accessToken,
        })
      )
    }
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 17. RESPONSE FORMAT CONSISTENCY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Response Format Consistency', () => {
  test('ok() helper returns correct shape', () => {
    const result = ok({ foo: 'bar' })
    expect(result).toEqual({ success: true, data: { foo: 'bar' } })
  })

  test('fail() helper returns correct shape', () => {
    const result = fail('Something went wrong', ERROR_CODES.INTERNAL_ERROR)
    expect(result).toEqual({
      success: false,
      error: 'Something went wrong',
      code: 'INTERNAL_ERROR',
    })
  })

  test('fail() defaults to INTERNAL_ERROR code', () => {
    const result = fail('Oops')
    expect(result.code).toBe(ERROR_CODES.INTERNAL_ERROR)
  })

  test('ERROR_CODES has all expected keys', () => {
    expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED')
    expect(ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN')
    expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND')
    expect(ERROR_CODES.CONFLICT).toBe('CONFLICT')
    expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(ERROR_CODES.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS')
    expect(ERROR_CODES.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED')
    expect(ERROR_CODES.TOKEN_INVALID).toBe('TOKEN_INVALID')
    expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    expect(ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 18. CLEANUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describeWithDB('Cleanup (database)', () => {
  afterAll(async () => {
    if (!HAS_DATABASE || !testUserId) return

    // Delete the test users and all cascaded data.
    const { prisma } = await import('@extracker/db')

    try {
      // Clean up any remaining test data. User cascade handles
      // expenses, categories, cards, notifications, refresh tokens, etc.
      await prisma.user.deleteMany({
        where: {
          email: { startsWith: 'test-' },
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      })
    } catch (e) {
      // Best-effort cleanup; do not fail the suite on cleanup errors.
      console.error('Cleanup error (non-fatal):', e)
    }
  })

  test('cleanup marker', () => {
    // This test exists only so the afterAll hook runs.
    expect(true).toBe(true)
  })
})
