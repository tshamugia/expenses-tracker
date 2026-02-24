import { NextResponse } from 'next/server'
import { verifyCredentials } from '@/lib/auth/verify-credentials'
import { signIn } from '@/auth'

/**
 * DEBUG ONLY - Test the full auth flow server-side
 * GET /api/test-auth?email=...&password=...
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const password = searchParams.get('password')

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password params required' }, { status: 400 })
  }

  const results: Record<string, unknown> = {}

  // Step 1: Test verifyCredentials directly
  try {
    const user = await verifyCredentials(email, password)
    results.step1_verifyCredentials = user
      ? { success: true, user }
      : { success: false, reason: 'returned null' }
  } catch (error) {
    results.step1_verifyCredentials = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }
  }

  // Step 2: Test server-side signIn
  try {
    const signInResult = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    results.step2_signIn = {
      success: true,
      result: signInResult,
      type: typeof signInResult,
    }
  } catch (error) {
    const err = error as Error & { type?: string; cause?: unknown }
    results.step2_signIn = {
      success: false,
      errorMessage: err.message,
      errorName: err.name,
      errorType: err.type,
      errorCause: err.cause ? String(err.cause) : undefined,
      isRedirect: err.message?.includes('NEXT_REDIRECT'),
      stack: err.stack?.split('\n').slice(0, 5).join('\n'),
    }
  }

  return NextResponse.json(results, { status: 200 })
}
