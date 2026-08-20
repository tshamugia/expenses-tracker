'use server'

import prisma from '@/lib/db/prisma'
import { sendVerificationEmail } from '@/lib/services/email'
import { generateSixDigitCode } from '@/lib/utils/token'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import {
  EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES,
  RATE_LIMIT_VERIFY,
} from '@/lib/constants/app-config'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Verify an email using the 6-digit code. Marks the user as verified and
 * consumes the token.
 */
export async function verifyEmailCode(
  email: string,
  code: string
): Promise<ActionResult> {
  try {
    // Rate limit verification attempts per IP + email
    const ip = await getClientIp()
    const rate = checkRateLimit(
      `verify:${ip}:${email}`,
      RATE_LIMIT_VERIFY.limit,
      RATE_LIMIT_VERIFY.windowMs
    )
    if (!rate.allowed) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    const token = await prisma.emailVerificationToken.findFirst({
      where: {
        email,
        token: code,
        used: false,
        expires: { gt: new Date() },
      },
    })

    if (!token) {
      return { success: false, error: 'Invalid or expired code' }
    }

    // Mark the user verified and consume the token
    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    })

    await prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { used: true },
    })

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error verifying email code:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify email',
    }
  }
}

/**
 * Resend a verification code. Always returns a generic success message to
 * avoid leaking whether an account exists or is already verified.
 */
export async function resendVerificationCode(
  email: string
): Promise<ActionResult<{ message: string }>> {
  const genericMessage = 'If your account needs verification, a new code has been sent.'

  try {
    // Rate limit resends per IP + email
    const ip = await getClientIp()
    const rate = checkRateLimit(
      `verify-resend:${ip}:${email}`,
      RATE_LIMIT_VERIFY.limit,
      RATE_LIMIT_VERIFY.windowMs
    )
    if (!rate.allowed) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { name: true, emailVerified: true },
    })

    // Only send if the account exists and is not already verified
    if (!user || user.emailVerified) {
      return { success: true, data: { message: genericMessage } }
    }

    // Invalidate any existing unused tokens for this email
    await prisma.emailVerificationToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    })

    const code = generateSixDigitCode()
    const expires = new Date(
      Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES * 60 * 1000
    )

    await prisma.emailVerificationToken.create({
      data: { email, token: code, expires, used: false },
    })

    await sendVerificationEmail({ email, code, userName: user.name || undefined })

    return { success: true, data: { message: genericMessage } }
  } catch (error) {
    console.error('Error resending verification code:', error)
    return { success: false, error: 'Failed to resend verification code' }
  }
}
