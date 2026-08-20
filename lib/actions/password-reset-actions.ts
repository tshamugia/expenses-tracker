'use server'

import { hash } from 'bcryptjs'
import prisma from '@/lib/db/prisma'
import { sendPasswordResetEmail } from '@/lib/services/email'
import { validatePassword } from '@/lib/utils/password-validation'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { generateSixDigitCode } from '@/lib/utils/token'
import {
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
  RATE_LIMIT_RESET,
} from '@/lib/constants/app-config'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Request password reset - sends email with code
 */
export async function requestPasswordReset(
  email: string
): Promise<ActionResult<{ message: string }>> {
  try {
    // Rate limit reset requests per IP + email
    const ip = await getClientIp()
    const rate = checkRateLimit(
      `reset-request:${ip}:${email}`,
      RATE_LIMIT_RESET.limit,
      RATE_LIMIT_RESET.windowMs
    )
    if (!rate.allowed) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, name: true },
    })

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        data: { message: 'If an account exists, a reset code has been sent to your email.' },
      }
    }

    // Generate 6-digit code
    const code = generateSixDigitCode()

    // Set expiration window
    const expires = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
    )

    // Invalidate any existing unused tokens for this email
    await prisma.passwordResetToken.updateMany({
      where: {
        email,
        used: false,
      },
      data: {
        used: true,
      },
    })

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        email,
        token: code,
        expires,
        used: false,
      },
    })

    // Send email with code
    const emailResult = await sendPasswordResetEmail({
      email,
      code,
      userName: user.name || undefined,
    })

    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error)
      // Don't reveal email send failure to user
    }

    return {
      success: true,
      data: { message: 'If an account exists, a reset code has been sent to your email.' },
    }
  } catch (error) {
    console.error('Error requesting password reset:', error)
    return {
      success: false,
      error: 'Failed to process password reset request',
    }
  }
}

/**
 * Verify reset code
 */
export async function verifyResetCode(
  email: string,
  code: string
): Promise<ActionResult<{ valid: boolean }>> {
  try {
    // Rate limit code verification per IP + email
    const ip = await getClientIp()
    const rate = checkRateLimit(
      `reset-verify:${ip}:${email}`,
      RATE_LIMIT_RESET.limit,
      RATE_LIMIT_RESET.windowMs
    )
    if (!rate.allowed) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        token: code,
        used: false,
        expires: {
          gt: new Date(), // Not expired
        },
      },
    })

    if (!resetToken) {
      return {
        success: false,
        error: 'Invalid or expired code',
      }
    }

    return {
      success: true,
      data: { valid: true },
    }
  } catch (error) {
    console.error('Error verifying reset code:', error)
    return {
      success: false,
      error: 'Failed to verify code',
    }
  }
}

/**
 * Reset password with verified code
 */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    // Validate password strength
    const validation = validatePassword(newPassword)
    if (!validation.isValid) {
      return { success: false, error: validation.error! }
    }

    // Find valid reset token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        token: code,
        used: false,
        expires: {
          gt: new Date(),
        },
      },
    })

    if (!resetToken) {
      return {
        success: false,
        error: 'Invalid or expired code',
      }
    }

    // Hash new password
    const hashedPassword = await hash(newPassword, 12)

    // Look up whether the email is already verified so we don't overwrite
    // an existing verification timestamp.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { emailVerified: true },
    })

    // Update user password and mark as having set password.
    // Receiving the reset code proves ownership of the email, so mark the
    // email verified too — otherwise sign-in would keep bouncing the user
    // back to the verification page after a successful reset.
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        hasSetPassword: true,
        emailVerified: existing?.emailVerified ?? new Date(),
      },
    })

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    })

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error resetting password:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset password',
    }
  }
}

/**
 * Change password for authenticated user (from profile page)
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    // Validate new password strength
    const validation = validatePassword(newPassword)
    if (!validation.isValid) {
      return { success: false, error: validation.error! }
    }

    // Get user with current password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    })

    if (!user || !user.password) {
      return {
        success: false,
        error: 'User not found or no password set',
      }
    }

    // Verify current password
    const { compare } = await import('bcryptjs')
    const isValidPassword = await compare(currentPassword, user.password)

    if (!isValidPassword) {
      return {
        success: false,
        error: 'Current password is incorrect',
      }
    }

    // Hash new password
    const hashedPassword = await hash(newPassword, 12)

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error changing password:', error)
    return {
      success: false,
      error: 'Failed to change password',
    }
  }
}
