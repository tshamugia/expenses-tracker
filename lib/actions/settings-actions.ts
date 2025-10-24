'use server'

/**
 * Server Actions for User Settings
 * BUSINESS LOGIC LAYER
 * - Handle user settings and preferences
 * - Notification preferences
 * - Theme settings
 * - Subscription management
 */

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db/prisma'
import { getAuthUserId } from '@/lib/auth/get-session'
import type {
  UserSettings,
  UpdateSettingsInput,
  SubscriptionPlanInfo,
  ActionResult,
} from '@/types/settings-types'

/**
 * Helper function to get the current authenticated user ID
 */
async function getCurrentUserId(): Promise<string> {
  return await getAuthUserId()
}

/**
 * Get user settings
 * Creates default settings if none exist
 */
export async function getUserSettings(): Promise<ActionResult<UserSettings>> {
  try {
    const userId = await getCurrentUserId()

    // Try to find existing settings
    let settings = await prisma.notificationPreference.findUnique({
      where: { userId },
    })

    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.notificationPreference.create({
        data: {
          userId,
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: false,
          notifyBeforeDays: 3,
          theme: 'light',
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
        },
      })
    }

    return {
      success: true,
      data: {
        id: settings.id,
        userId: settings.userId,
        emailEnabled: settings.emailEnabled,
        smsEnabled: settings.smsEnabled,
        pushEnabled: settings.pushEnabled,
        notifyBeforeDays: settings.notifyBeforeDays,
        theme: settings.theme as 'light' | 'dark' | 'system',
        subscriptionPlan: settings.subscriptionPlan as 'free' | 'pro' | 'enterprise',
        subscriptionStatus: settings.subscriptionStatus as 'active' | 'canceled' | 'expired',
      },
    }
  } catch (error) {
    console.error('Error in getUserSettings:', error)
    return {
      success: false,
      error: 'Failed to load user settings',
    }
  }
}

/**
 * Update user settings
 */
export async function updateUserSettings(
  input: UpdateSettingsInput
): Promise<ActionResult<UserSettings>> {
  try {
    const userId = await getCurrentUserId()

    // Ensure settings exist first
    const existingSettings = await prisma.notificationPreference.findUnique({
      where: { userId },
    })

    let settings
    if (existingSettings) {
      // Update existing settings
      settings = await prisma.notificationPreference.update({
        where: { userId },
        data: {
          ...(input.emailEnabled !== undefined && {
            emailEnabled: input.emailEnabled,
          }),
          ...(input.smsEnabled !== undefined && {
            smsEnabled: input.smsEnabled,
          }),
          ...(input.pushEnabled !== undefined && {
            pushEnabled: input.pushEnabled,
          }),
          ...(input.notifyBeforeDays !== undefined && {
            notifyBeforeDays: input.notifyBeforeDays,
          }),
          ...(input.theme !== undefined && { theme: input.theme }),
        },
      })
    } else {
      // Create new settings with provided values
      settings = await prisma.notificationPreference.create({
        data: {
          userId,
          emailEnabled: input.emailEnabled ?? true,
          smsEnabled: input.smsEnabled ?? false,
          pushEnabled: input.pushEnabled ?? false,
          notifyBeforeDays: input.notifyBeforeDays ?? 3,
          theme: input.theme ?? 'light',
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
        },
      })
    }

    revalidatePath('/settings')

    return {
      success: true,
      data: {
        id: settings.id,
        userId: settings.userId,
        emailEnabled: settings.emailEnabled,
        smsEnabled: settings.smsEnabled,
        pushEnabled: settings.pushEnabled,
        notifyBeforeDays: settings.notifyBeforeDays,
        theme: settings.theme as 'light' | 'dark' | 'system',
        subscriptionPlan: settings.subscriptionPlan as 'free' | 'pro' | 'enterprise',
        subscriptionStatus: settings.subscriptionStatus as 'active' | 'canceled' | 'expired',
      },
    }
  } catch (error) {
    console.error('Error in updateUserSettings:', error)
    return {
      success: false,
      error: 'Failed to update settings',
    }
  }
}

/**
 * Get available subscription plans
 */
export async function getSubscriptionPlans(): Promise<
  ActionResult<SubscriptionPlanInfo[]>
> {
  try {
    const plans: SubscriptionPlanInfo[] = [
      {
        name: 'Free',
        price: '$0/month',
        features: [
          'Up to 10 expenses per month',
          'Basic expense tracking',
          'Email notifications',
          'Single user',
        ],
      },
      {
        name: 'Pro',
        price: '$9.99/month',
        features: [
          'Unlimited expenses',
          'Advanced analytics',
          'Priority email support',
          'Multiple payment cards',
          'Recurring expense automation',
          'Export to CSV/PDF',
        ],
        popular: true,
      },
      {
        name: 'Enterprise',
        price: '$29.99/month',
        features: [
          'Everything in Pro',
          'Team collaboration',
          'Custom categories',
          'API access',
          'Dedicated support',
          'Advanced security',
          'Custom integrations',
        ],
      },
    ]

    return {
      success: true,
      data: plans,
    }
  } catch (error) {
    console.error('Error in getSubscriptionPlans:', error)
    return {
      success: false,
      error: 'Failed to load subscription plans',
    }
  }
}

/**
 * Upgrade subscription plan (placeholder for now)
 */
export async function upgradeSubscription(
  plan: 'pro' | 'enterprise'
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await getCurrentUserId()

    // In a real app, this would:
    // 1. Integrate with a payment processor (Stripe, PayPal, etc.)
    // 2. Create a checkout session
    // 3. Handle webhooks for successful payment
    // 4. Update subscription in database

    // For demo purposes, just update the plan
    await prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
      },
      create: {
        userId,
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
      },
    })

    revalidatePath('/settings')

    return {
      success: true,
      data: {
        message: `Successfully upgraded to ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan! (Demo mode - no payment required)`,
      },
    }
  } catch (error) {
    console.error('Error in upgradeSubscription:', error)
    return {
      success: false,
      error: 'Failed to upgrade subscription',
    }
  }
}
