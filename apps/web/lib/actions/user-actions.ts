'use server'

/**
 * Server Actions for User Profile
 * BUSINESS LOGIC LAYER
 * - Handle user profile updates
 * - Password management
 * - Avatar uploads
 * - User statistics
 */

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db/prisma'
import { getAuthUserId } from '@/lib/auth/get-session'
import type {
  ActionResult,
  UserProfile,
  UpdateProfileInput,
  SetPasswordInput,
  UserStats,
} from '@extracker/types'

/**
 * Helper function to get the current authenticated user ID
 */
async function getCurrentUserId(): Promise<string> {
  return await getAuthUserId()
}

/**
 * Get current user profile
 */
export async function getUserProfile(): Promise<ActionResult<UserProfile>> {
  try {
    const userId = await getCurrentUserId()

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        hasSetPassword: true,
        createdAt: true,
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    })

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      }
    }

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        provider: user.accounts[0]?.provider || null,
        hasPassword: user.hasSetPassword,
        createdAt: user.createdAt,
      },
    }
  } catch (error) {
    console.error('Error in getUserProfile:', error)
    return {
      success: false,
      error: 'Failed to load user profile',
    }
  }
}

/**
 * Update user profile (name, email, avatar)
 */
export async function updateUserProfile(
  input: UpdateProfileInput
): Promise<ActionResult<UserProfile>> {
  try {
    const userId = await getCurrentUserId()

    // Validate input
    if (input.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(input.email)) {
        return {
          success: false,
          error: 'Invalid email format',
        }
      }

      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: input.email,
          NOT: { id: userId },
        },
      })

      if (existingUser) {
        return {
          success: false,
          error: 'Email is already in use',
        }
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.image !== undefined && { image: input.image }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        hasSetPassword: true,
        createdAt: true,
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    })

    revalidatePath('/profile')

    return {
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        image: updatedUser.image,
        provider: updatedUser.accounts[0]?.provider || null,
        hasPassword: updatedUser.hasSetPassword,
        createdAt: updatedUser.createdAt,
      },
    }
  } catch (error) {
    console.error('Error in updateUserProfile:', error)
    return {
      success: false,
      error: 'Failed to update profile',
    }
  }
}

/**
 * Set or change password
 */
export async function setPassword(
  input: SetPasswordInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await getCurrentUserId()

    // Validate new password
    if (input.newPassword.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters long',
      }
    }

    // Validate confirm password
    if (input.newPassword !== input.confirmPassword) {
      return {
        success: false,
        error: 'Passwords do not match',
      }
    }

    // Get user with current password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    })

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      }
    }

    // If user already has a password, verify current password
    if (user.password && input.currentPassword) {
      const { compare } = await import('bcryptjs')
      const isValidPassword = await compare(input.currentPassword, user.password)

      if (!isValidPassword) {
        return {
          success: false,
          error: 'Current password is incorrect',
        }
      }
    } else if (user.password && !input.currentPassword) {
      return {
        success: false,
        error: 'Current password is required',
      }
    }

    // Hash new password
    const { hash } = await import('bcryptjs')
    const hashedPassword = await hash(input.newPassword, 12)

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        hasSetPassword: true,
      },
    })

    revalidatePath('/profile')

    return {
      success: true,
      data: {
        message: user.password ? 'Password changed successfully' : 'Password set successfully',
      },
    }
  } catch (error) {
    console.error('Error in setPassword:', error)
    return {
      success: false,
      error: 'Failed to set password',
    }
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<ActionResult<UserStats>> {
  try {
    const userId = await getCurrentUserId()

    // Get total expenses count and sum
    const expensesData = await prisma.expense.aggregate({
      where: { userId },
      _count: true,
      _sum: {
        amount: true,
      },
    })

    // Get total payment cards count
    const cardsCount = await prisma.paymentCard.count({
      where: { userId },
    })

    return {
      success: true,
      data: {
        totalExpenses: expensesData._count,
        totalAmount: Number(expensesData._sum.amount || 0),
        totalCards: cardsCount,
      },
    }
  } catch (error) {
    console.error('Error in getUserStats:', error)
    return {
      success: false,
      error: 'Failed to load user statistics',
    }
  }
}

/**
 * Delete user avatar
 */
export async function deleteUserAvatar(): Promise<ActionResult<UserProfile>> {
  try {
    const userId = await getCurrentUserId()

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { image: null },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        hasSetPassword: true,
        createdAt: true,
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    })

    revalidatePath('/profile')

    return {
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        image: updatedUser.image,
        provider: updatedUser.accounts[0]?.provider || null,
        hasPassword: updatedUser.hasSetPassword,
        createdAt: updatedUser.createdAt,
      },
    }
  } catch (error) {
    console.error('Error in deleteUserAvatar:', error)
    return {
      success: false,
      error: 'Failed to delete avatar',
    }
  }
}
