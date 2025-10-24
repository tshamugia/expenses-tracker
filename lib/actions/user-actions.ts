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
  UserProfile,
  UpdateProfileInput,
  SetPasswordInput,
  UserStats,
  ActionResult,
} from '@/types/user-types'

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
        hasPassword: false, // Auth.js handles this now
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
        hasPassword: false, // Auth.js handles this now
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
 * Note: Password management is now handled by Auth.js
 * This function is kept for backward compatibility but should not be used
 */
export async function setPassword(
  input: SetPasswordInput
): Promise<ActionResult<{ message: string }>> {
  return {
    success: false,
    error: 'Password management is now handled by Auth.js OAuth providers',
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
        hasPassword: false, // Auth.js handles this now
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
