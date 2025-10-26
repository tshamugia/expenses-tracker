'use client'

/**
 * PaymentCardDisplay Component
 * Displays a payment card with visual design showing last 4 digits and card name
 */

import type { PaymentCardInfo } from '@/types/expense-types'
import { CreditCard } from 'lucide-react'

interface PaymentCardDisplayProps {
  paymentCard: PaymentCardInfo
  className?: string
}

export function PaymentCardDisplay({
  paymentCard,
  className = '',
}: PaymentCardDisplayProps) {
  // Get card brand styling
  const getBrandColor = (brand: string) => {
    const brandLower = brand.toLowerCase()
    switch (brandLower) {
      case 'visa':
        return { bg: 'bg-blue-600', text: 'text-white' }
      case 'mastercard':
        return { bg: 'bg-red-600', text: 'text-white' }
      case 'amex':
        return { bg: 'bg-teal-600', text: 'text-white' }
      case 'discover':
        return { bg: 'bg-orange-600', text: 'text-white' }
      default:
        return { bg: 'bg-slate-600', text: 'text-white' }
    }
  }

  const brandStyle = getBrandColor(paymentCard.cardBrand)

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Card Visual */}
      <div
        className={`relative w-16 h-10 rounded-lg ${brandStyle.bg} flex items-center justify-center overflow-hidden`}
      >
        {/* Custom color override if available */}
        {paymentCard.color && (
          <div
            className="absolute inset-0 opacity-90"
            style={{ backgroundColor: paymentCard.color }}
          />
        )}

        {/* Card icon/logo */}
        <div className={`relative z-10 flex items-center justify-center ${brandStyle.text}`}>
          <CreditCard className="h-4 w-4" />
        </div>
      </div>

      {/* Card Info */}
      <div className="flex flex-col gap-0.5">
        {/* Card nickname or brand */}
        <div className="text-sm font-medium text-slate-900 dark:text-white">
          {paymentCard.nickname || paymentCard.cardBrand}
        </div>

        {/* Last 4 digits */}
        <div className="text-xs text-slate-600 dark:text-slate-400">
          ••••&nbsp;{paymentCard.lastFourDigits}
        </div>
      </div>
    </div>
  )
}
