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
import { prisma } from '@extracker/db'
import { getAuthUserId } from '@/lib/auth/get-session'
import type {
  ActionResult,
  UserSettings,
  UpdateSettingsInput,
  SubscriptionPlanInfo,
} from '@extracker/types'

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
          defaultCurrency: 'GEL',
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
        defaultCurrency: (settings.defaultCurrency || 'GEL') as 'GEL' | 'USD' | 'EUR',
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
          ...(input.defaultCurrency !== undefined && { defaultCurrency: input.defaultCurrency }),
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
          defaultCurrency: input.defaultCurrency ?? 'GEL',
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
        },
      })
    }

    revalidatePath('/settings')
    revalidatePath('/dashboard')

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
        defaultCurrency: (settings.defaultCurrency || 'GEL') as 'GEL' | 'USD' | 'EUR',
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
 * Returns same structure as landing page pricing
 */
export async function getSubscriptionPlans(): Promise<
  ActionResult<SubscriptionPlanInfo[]>
> {
  try {
    const plans: SubscriptionPlanInfo[] = [
      {
        name: 'Starter',
        price: 'Free',
        description: 'Perfect for getting started',
        features: [
          'Up to 10 expenses',
          'Basic analytics',
          'Manual payment tracking',
          'Email support',
        ],
        cta: 'Current Plan',
        highlighted: false,
      },
      {
        name: 'Pro',
        price: '$4.99',
        period: '/month',
        description: 'Best for regular users',
        features: [
          'Unlimited expenses',
          'Advanced analytics',
          'Recurring payments',
          'Payment reminders',
          'Category tracking',
          'Priority support',
        ],
        cta: 'Start Free Trial',
        highlighted: true,
      },
      {
        name: 'Business',
        price: '$9.99',
        period: '/month',
        description: 'For teams and businesses',
        features: [
          'Everything in Pro',
          'Multi-user collaboration',
          'Custom reports',
          'API access',
          'Dedicated support',
          'Advanced security',
        ],
        cta: 'Contact Sales',
        highlighted: false,
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
  plan: 'pro' | 'business'
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await getCurrentUserId()

    // Map plan names to database values
    const planMapping: Record<string, string> = {
      'pro': 'pro',
      'business': 'enterprise', // Map business to enterprise for backward compatibility
    }

    const dbPlan = planMapping[plan] || plan

    // In a real app, this would:
    // 1. Integrate with a payment processor (Stripe, PayPal, etc.)
    // 2. Create a checkout session
    // 3. Handle webhooks for successful payment
    // 4. Update subscription in database

    // For demo purposes, just update the plan
    await prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        subscriptionPlan: dbPlan,
        subscriptionStatus: 'active',
      },
      create: {
        userId,
        subscriptionPlan: dbPlan,
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
