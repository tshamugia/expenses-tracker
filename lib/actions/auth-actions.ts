'use server'

import { hash, compare } from 'bcryptjs'
import { signIn } from '@/auth'
import prisma from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { AuthError } from 'next-auth'
import { validatePassword } from '@/lib/utils/password-validation'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { generateSixDigitCode } from '@/lib/utils/token'
import { sendVerificationEmail } from '@/lib/services/email'
import {
  EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES,
  RATE_LIMIT_LOGIN,
  RATE_LIMIT_SIGNUP,
} from '@/lib/constants/app-config'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

/**
 * Set password for a user (for Google OAuth users or password reset)
 */
export async function setUserPassword(
  userId: string,
  password: string
): Promise<ActionResult> {
  try {
    // Validate password strength
    const validation = validatePassword(password)
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error!,
      }
    }

    // Hash password
    const hashedPassword = await hash(password, 12)

    // Update user with password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        hasSetPassword: true,
      },
    })

    revalidatePath('/profile')
    revalidatePath('/dashboard')

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error setting password:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set password'
    }
  }
}

/**
 * Sign in with email and password.
 * Blocks unverified accounts and returns code 'EMAIL_NOT_VERIFIED' so the
 * caller can redirect the user to the verification page.
 */
export async function signInWithCredentials(
  email: string,
  password: string
): Promise<ActionResult> {
  try {
    // Rate limit by IP + email to slow down credential stuffing
    const ip = await getClientIp()
    const rate = checkRateLimit(
      `login:${ip}:${email}`,
      RATE_LIMIT_LOGIN.limit,
      RATE_LIMIT_LOGIN.windowMs
    )
    if (!rate.allowed) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    // Verify the account exists and the password matches before enforcing rules
    const user = await prisma.user.findUnique({
      where: { email },
      select: { password: true, emailVerified: true },
    })

    if (!user || !user.password || !(await compare(password, user.password))) {
      return { success: false, error: 'Invalid email or password' }
    }

    // Block sign-in until the email is verified
    if (!user.emailVerified) {
      return {
        success: false,
        error: 'Please verify your email before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
      }
    }

    await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Sign in error:', error)

    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return {
            success: false,
            error: 'Invalid email or password'
          }
        default:
          return {
            success: false,
            error: 'Something went wrong. Please try again.'
          }
      }
    }

    return {
      success: false,
      error: 'Failed to sign in'
    }
  }
}

/**
 * Sign up with email and password.
 * Creates an UNVERIFIED account and emails a 6-digit verification code.
 * The user must verify before they can sign in.
 */
export async function signUpWithCredentials(
  email: string,
  password: string,
  name?: string
): Promise<ActionResult<{ userId: string; needsVerification: true }>> {
  try {
    // Rate limit sign-ups per IP
    const ip = await getClientIp()
    const rate = checkRateLimit(
      `signup:${ip}`,
      RATE_LIMIT_SIGNUP.limit,
      RATE_LIMIT_SIGNUP.windowMs
    )
    if (!rate.allowed) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return {
        success: false,
        error: 'An account with this email already exists'
      }
    }

    // Validate password strength
    const validation = validatePassword(password)
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error!,
      }
    }

    // Hash password
    const hashedPassword = await hash(password, 12)

    // Create user (unverified - emailVerified stays null until code is confirmed)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        hasSetPassword: true,
        name: name || null,
      },
    })

    // Generate + store a verification code, then email it
    const code = generateSixDigitCode()
    const expires = new Date(
      Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES * 60 * 1000
    )

    await prisma.emailVerificationToken.create({
      data: { email, token: code, expires, used: false },
    })

    await sendVerificationEmail({ email, code, userName: user.name || undefined })

    return {
      success: true,
      data: { userId: user.id, needsVerification: true }
    }
  } catch (error) {
    console.error('Sign up error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create account'
    }
  }
}
