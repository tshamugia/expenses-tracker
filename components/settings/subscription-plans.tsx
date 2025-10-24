'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Crown, Check, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { upgradeSubscription } from '@/lib/actions/settings-actions'
import type { UserSettings, SubscriptionPlanInfo } from '@/types/settings-types'
import { cn } from '@/lib/utils'

interface SubscriptionPlansProps {
  settings: UserSettings
  plans: SubscriptionPlanInfo[]
}

export function SubscriptionPlans({ settings, plans }: SubscriptionPlansProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleUpgrade = async (planName: string) => {
    const plan = planName.toLowerCase() as 'pro' | 'enterprise'
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
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrentPlan =
              settings.subscriptionPlan.toLowerCase() === plan.name.toLowerCase()
            const canUpgrade = plan.name.toLowerCase() !== 'free'

            return (
              <Card
                key={plan.name}
                className={cn(
                  'relative overflow-hidden',
                  plan.popular && 'border-primary shadow-lg',
                  isCurrentPlan && 'bg-muted/50'
                )}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold">
                    <Sparkles className="inline h-3 w-3 mr-1" />
                    Popular
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    {isCurrentPlan && (
                      <Badge variant="secondary">Current Plan</Badge>
                    )}
                  </div>
                  <div className="text-3xl font-bold">{plan.price}</div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  {isCurrentPlan ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                    >
                      Current Plan
                    </Button>
                  ) : canUpgrade ? (
                    <Button
                      className="w-full"
                      onClick={() => handleUpgrade(plan.name)}
                      disabled={isLoading !== null}
                    >
                      {isLoading === plan.name.toLowerCase() ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Upgrading...
                        </>
                      ) : (
                        <>
                          <Crown className="mr-2 h-4 w-4" />
                          Upgrade to {plan.name}
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                    >
                      Current Plan
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>

        {/* Current Plan Summary */}
        <div className="mt-6 rounded-lg bg-muted p-4">
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
