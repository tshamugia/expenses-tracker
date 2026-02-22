import { Elysia, t } from 'elysia'
import { hash, compare } from 'bcryptjs'
import { prisma } from '@extracker/db'
import jwtPlugin from '../plugins/jwt.plugin'
import { bearer } from '@elysiajs/bearer'
import { authMiddleware } from '../middleware/auth.middleware'
import { ok, fail, ERROR_CODES } from '../utils/response'
import { sendPasswordResetEmail } from '../utils/email'

const REFRESH_TOKEN_EXPIRY_DAYS = 30

function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function generateRefreshToken(): string {
  return crypto.randomUUID()
}

async function issueTokens(jwt: { sign: (payload: Record<string, string | number>) => Promise<string> }, userId: string, email: string) {
  const accessToken = await jwt.sign({
    sub: userId,
    email,
  })

  const refreshToken = generateRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt,
    },
  })

  return { accessToken, refreshToken }
}

export const authRoutes = new Elysia({ prefix: '/auth', name: 'routes/auth' })
  .use(jwtPlugin)
  .use(bearer())

  // ─── Public Endpoints ─────────────────────────────────────────────

  .post(
    '/register',
    async ({ jwt, body, set }) => {
      const { email, password, name } = body

      const existingUser = await prisma.user.findUnique({
        where: { email },
      })

      if (existingUser) {
        set.status = 409
        return fail('An account with this email already exists', ERROR_CODES.CONFLICT)
      }

      if (password.length < 8) {
        set.status = 422
        return fail('Password must be at least 8 characters long', ERROR_CODES.VALIDATION_ERROR)
      }

      const hashedPassword = await hash(password, 12)

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          hasSetPassword: true,
          name: name || null,
          emailVerified: new Date(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
        },
      })

      const tokens = await issueTokens(jwt, user.id, user.email)

      set.status = 201
      return ok({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Register a new account',
        description: 'Creates a new user account and returns access + refresh tokens. Returns 409 if email already exists.',
      },
    }
  )

  .post(
    '/login',
    async ({ jwt, body, set }) => {
      const { email, password } = body

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          password: true,
          createdAt: true,
        },
      })

      if (!user || !user.password) {
        set.status = 401
        return fail('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS)
      }

      const isValidPassword = await compare(password, user.password)

      if (!isValidPassword) {
        set.status = 401
        return fail('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS)
      }

      const tokens = await issueTokens(jwt, user.id, user.email)

      return ok({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          createdAt: user.createdAt,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Login with email and password',
        description: 'Authenticates with credentials and returns access + refresh tokens. Access token expires in 15 minutes.',
      },
    }
  )

  .post(
    '/google',
    async ({ jwt, body, set }) => {
      const { idToken } = body

      // Verify Google ID token
      let googlePayload: { email: string; name?: string; picture?: string; sub: string; aud: string }
      try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`)
        if (!response.ok) {
          set.status = 401
          return fail('Invalid Google ID token', ERROR_CODES.INVALID_CREDENTIALS)
        }
        googlePayload = (await response.json()) as typeof googlePayload
      } catch {
        set.status = 401
        return fail('Failed to verify Google ID token', ERROR_CODES.INVALID_CREDENTIALS)
      }

      // Validate audience matches our Google Client ID
      const googleClientId = process.env.GOOGLE_CLIENT_ID
      if (googleClientId && googlePayload.aud !== googleClientId) {
        set.status = 401
        return fail('Invalid token audience', ERROR_CODES.INVALID_CREDENTIALS)
      }

      if (!googlePayload.email) {
        set.status = 422
        return fail('Google account does not have an email', ERROR_CODES.VALIDATION_ERROR)
      }

      // Upsert user
      let user = await prisma.user.findUnique({
        where: { email: googlePayload.email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
        },
      })

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: googlePayload.email,
            name: googlePayload.name || null,
            image: googlePayload.picture || null,
            emailVerified: new Date(),
          },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            createdAt: true,
          },
        })
      }

      // Upsert the Google account link
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        },
      })

      if (!existingAccount) {
        await prisma.account.create({
          data: {
            userId: user.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        })
      }

      const tokens = await issueTokens(jwt, user.id, user.email)

      return ok({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    },
    {
      body: t.Object({
        idToken: t.String(),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Login with Google ID token',
        description: 'Verifies a Google ID token, creates or links the account, and returns access + refresh tokens.',
      },
    }
  )

  .post(
    '/refresh',
    async ({ jwt, body, set }) => {
      const { refreshToken } = body

      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: { select: { id: true, email: true } } },
      })

      if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
        set.status = 401
        return fail('Invalid or expired refresh token', ERROR_CODES.TOKEN_EXPIRED)
      }

      // Revoke old token (rotation)
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true },
      })

      // Issue new pair
      const tokens = await issueTokens(jwt, storedToken.user.id, storedToken.user.email)

      return ok({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        description: 'Exchanges a valid refresh token for a new access + refresh token pair. Old refresh token is revoked (rotation).',
      },
    }
  )

  .post(
    '/forgot-password',
    async ({ body }) => {
      const { email } = body

      const user = await prisma.user.findUnique({
        where: { email },
        select: { email: true, name: true },
      })

      // Always return success to prevent email enumeration
      if (!user) {
        return ok({ message: 'If an account exists, a reset code has been sent to your email.' })
      }

      const code = generateResetCode()
      const expires = new Date(Date.now() + 15 * 60 * 1000)

      // Invalidate existing unused tokens
      await prisma.passwordResetToken.updateMany({
        where: { email, used: false },
        data: { used: true },
      })

      await prisma.passwordResetToken.create({
        data: { email, token: code, expires, used: false },
      })

      const emailResult = await sendPasswordResetEmail({
        email,
        code,
        userName: user.name || undefined,
      })

      if (!emailResult.success) {
        console.error('Failed to send reset email:', emailResult.error)
      }

      return ok({ message: 'If an account exists, a reset code has been sent to your email.' })
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Request password reset code',
        description: 'Sends a 6-digit reset code to the email. Always returns success to prevent email enumeration. Code expires in 15 minutes.',
      },
    }
  )

  .post(
    '/verify-code',
    async ({ body, set }) => {
      const { email, code } = body

      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          email,
          token: code,
          used: false,
          expires: { gt: new Date() },
        },
      })

      if (!resetToken) {
        set.status = 400
        return fail('Invalid or expired code', ERROR_CODES.VALIDATION_ERROR)
      }

      return ok({ valid: true })
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        code: t.String({ minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Verify password reset code',
        description: 'Validates a 6-digit reset code without consuming it. Use before showing the new password form.',
      },
    }
  )

  .post(
    '/reset-password',
    async ({ body, set }) => {
      const { email, code, newPassword } = body

      if (newPassword.length < 8) {
        set.status = 422
        return fail('Password must be at least 8 characters long', ERROR_CODES.VALIDATION_ERROR)
      }

      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          email,
          token: code,
          used: false,
          expires: { gt: new Date() },
        },
      })

      if (!resetToken) {
        set.status = 400
        return fail('Invalid or expired code', ERROR_CODES.VALIDATION_ERROR)
      }

      const hashedPassword = await hash(newPassword, 12)

      await prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          hasSetPassword: true,
        },
      })

      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      })

      return ok({ message: 'Password has been reset successfully.' })
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        code: t.String({ minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }),
        newPassword: t.String({ minLength: 8, maxLength: 128 }),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Reset password with verified code',
        description: 'Resets the password using a valid 6-digit code. The code is consumed after successful reset.',
      },
    }
  )

  // ─── Protected Endpoints ──────────────────────────────────────────

  .use(authMiddleware)

  .post(
    '/logout',
    async ({ body, userId, set }) => {
      const { refreshToken } = body

      // Revoke the refresh token belonging to this user
      await prisma.refreshToken.updateMany({
        where: {
          token: refreshToken,
          userId,
          revoked: false,
        },
        data: { revoked: true },
      })

      set.status = 204
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Logout and revoke refresh token',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  .post(
    '/change-password',
    async ({ body, userId, set }) => {
      const { currentPassword, newPassword } = body

      if (newPassword.length < 8) {
        set.status = 422
        return fail('Password must be at least 8 characters long', ERROR_CODES.VALIDATION_ERROR)
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      })

      if (!user || !user.password) {
        set.status = 400
        return fail('User not found or no password set', ERROR_CODES.VALIDATION_ERROR)
      }

      const isValidPassword = await compare(currentPassword, user.password)

      if (!isValidPassword) {
        set.status = 401
        return fail('Current password is incorrect', ERROR_CODES.INVALID_CREDENTIALS)
      }

      const hashedPassword = await hash(newPassword, 12)

      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      })

      return ok({ message: 'Password changed successfully.' })
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1, maxLength: 128 }),
        newPassword: t.String({ minLength: 8, maxLength: 128 }),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Change password for authenticated user',
        security: [{ bearerAuth: [] }],
      },
    }
  )
