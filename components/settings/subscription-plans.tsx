'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Crown, Check, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { upgradeSubscription } from '@/lib/actions/settings-actions'
import type { UserSettings, SubscriptionPlanInfo } from '@/types/settings-types'

interface SubscriptionPlansProps {
  settings: UserSettings
  plans: SubscriptionPlanInfo[]
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

export function SubscriptionPlans({ settings, plans }: SubscriptionPlansProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleUpgrade = async (planName: string) => {
    const plan = planName.toLowerCase() as 'pro' | 'business'
    setIsLoading(plan)

    try {
      const result = await upgradeSubscription(plan)

      if (result.success) {
        toast.success(result.data.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to upgrade subscription')
      console.error('Subscription upgrade error:', error)
    } finally {
      setIsLoading(null)
    }
  }

  // Map subscription plan names for comparison
  const normalizeNames = (name: string) => {
    const mapping: Record<string, string> = {
      'free': 'starter',
      'starter': 'starter',
      'pro': 'pro',
      'business': 'business',
      'enterprise': 'business'
    }
    return mapping[name.toLowerCase()] || name.toLowerCase()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5" />
          Subscription Plans
        </CardTitle>
        <CardDescription>
          Choose the plan that best fits your needs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {plans.map((plan) => {
            const isCurrentPlan = normalizeNames(settings.subscriptionPlan) === normalizeNames(plan.name)
            const canUpgrade = plan.name.toLowerCase() !== 'starter' && !isCurrentPlan

            return (
              <motion.div
                key={plan.name}
                className={`relative rounded-lg p-6 transition-all sm:p-8 ${
                  plan.highlighted
                    ? 'bg-blue-600 text-white shadow-2xl md:scale-105'
                    : 'bg-slate-50 text-slate-900 shadow-lg hover:shadow-xl'
                } ${isCurrentPlan ? 'ring-2 ring-green-500' : ''}`}
                variants={cardVariants}
              >
                {plan.highlighted && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <span className="bg-amber-400 text-slate-900 px-3 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-green-500 hover:bg-green-600">
                      Current Plan
                    </Badge>
                  </div>
                )}

                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className={plan.highlighted ? 'text-blue-100' : 'text-slate-600'}>
                  {plan.description}
                </p>

                <div className="my-6">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span
                      className={plan.highlighted ? 'text-blue-100' : 'text-slate-600'}
                    >
                      {plan.period}
                    </span>
                  )}
                </div>

                <Button
                  onClick={() => canUpgrade && handleUpgrade(plan.name)}
                  disabled={!canUpgrade || isLoading !== null}
                  className={`w-full mb-8 ${
                    plan.highlighted
                      ? 'bg-white text-blue-600 hover:bg-slate-100'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isLoading === plan.name.toLowerCase() ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Upgrading...
                    </>
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : (
                    plan.cta
                  )}
                </Button>

                <div className="space-y-4">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center space-x-3">
                      <Check
                        className={`h-5 w-5 flex-shrink-0 ${
                          plan.highlighted ? 'text-white' : 'text-green-600'
                        }`}
                      />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Current Plan Summary */}
        <div className="mt-8 rounded-lg bg-muted p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Current Subscription</p>
              <p className="text-xs text-muted-foreground mt-1">
                Status: <span className="capitalize">{settings.subscriptionStatus}</span>
              </p>
            </div>
            <Badge variant="secondary" className="capitalize">
              {settings.subscriptionPlan} Plan
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          💡 This is a demo. No actual payment will be processed.
        </p>
      </CardContent>
    </Card>
  )
}
