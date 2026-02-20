'use server'

import { hash } from 'bcryptjs'
import { signIn } from '@/auth'
import prisma from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { AuthError } from 'next-auth'
import type { ActionResult } from '@extracker/types'

/**
 * Set password for a user (for Google OAuth users or password reset)
 */
export async function setUserPassword(
  userId: string,
  password: string
): Promise<ActionResult> {
  try {
    // Validate password strength
    if (password.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters long'
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
 * Sign in with email and password
 */
export async function signInWithCredentials(
  email: string,
  password: string
): Promise<ActionResult> {
  try {
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
 * Sign up with email and password
 */
export async function signUpWithCredentials(
  email: string,
  password: string,
  name?: string
): Promise<ActionResult<{ userId: string }>> {
  try {
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
    if (password.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters long'
      }
    }

    // Hash password
    const hashedPassword = await hash(password, 12)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        hasSetPassword: true,
        name: name || null,
        emailVerified: new Date(), // Auto-verify for now
      },
    })

    // Sign in the user
    await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    return {
      success: true,
      data: { userId: user.id }
    }
  } catch (error) {
    console.error('Sign up error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create account'
    }
  }
}

