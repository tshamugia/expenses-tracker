import { NextResponse } from 'next/server'
import { prisma } from '@extracker/db'

/**
 * DEBUG ONLY - Remove after fixing auth issues
 * Tests the credential verification flow in the API route context
 */
export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Test database connection
  try {
    const count = await prisma.user.count()
    results.dbConnection = { success: true, userCount: count }
  } catch (error) {
    results.dbConnection = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // 2. Check users with passwords
  try {
    const users = await prisma.user.findMany({
      select: {
        email: true,
        hasSetPassword: true,
        password: true,
      },
    })
    results.usersWithPasswords = users.map((u) => ({
      email: u.email,
      hasPassword: !!u.password,
      hasSetPassword: u.hasSetPassword,
      passwordHashPrefix: u.password ? u.password.substring(0, 7) : null,
    }))
  } catch (error) {
    results.usersWithPasswords = {
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // 3. Test bcryptjs import
  try {
    const { hash, compare } = await import('bcryptjs')
    const testHash = await hash('test123', 12)
    const testCompare = await compare('test123', testHash)
    results.bcryptjs = {
      success: true,
      hashWorks: !!testHash,
      compareWorks: testCompare,
    }
  } catch (error) {
    results.bcryptjs = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // 4. Check environment variables
  results.envVars = {
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL,
    nodeEnv: process.env.NODE_ENV,
  }

  // 5. Test verifyCredentials import
  try {
    const { verifyCredentials } = await import('@/lib/auth/verify-credentials')
    results.verifyCredentialsImport = {
      success: true,
      type: typeof verifyCredentials,
    }
  } catch (error) {
    results.verifyCredentialsImport = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  return NextResponse.json(results, { status: 200 })
}
