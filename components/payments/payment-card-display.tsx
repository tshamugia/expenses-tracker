'use client'

import { motion } from 'framer-motion'
import { Edit, Trash2 } from 'lucide-react'
import { formatExpiryDate, formatCardNumber } from '@/lib/utils/card-validation'
import type { PaymentCardListItem } from '@/types/payment-card-types'

interface PaymentCardDisplayProps {
  card: PaymentCardListItem
  onEdit?: (card: PaymentCardListItem) => void
  onDelete?: (card: PaymentCardListItem) => void
  isSelectable?: boolean
  isSelected?: boolean
  onSelect?: (card: PaymentCardListItem) => void
}

// Card brand logos as SVG components
const VisaLogo = () => (
  <svg viewBox="0 0 48 32" className="h-8 w-12">
    <rect width="48" height="32" rx="4" fill="#1434CB" />
    <text x="24" y="20" fontSize="10" fontWeight="bold" fill="white" textAnchor="middle">
      VISA
    </text>
  </svg>
)

const MastercardLogo = () => (
  <svg viewBox="0 0 48 32" className="h-8 w-12">
    <rect width="48" height="32" rx="4" fill="white" />
    <circle cx="18" cy="16" r="8" fill="#EB001B" />
    <circle cx="30" cy="16" r="8" fill="#FF5F00" />
  </svg>
)

const AmexLogo = () => (
  <svg viewBox="0 0 48 32" className="h-8 w-12">
    <rect width="48" height="32" rx="4" fill="#006FCF" />
    <text x="24" y="20" fontSize="8" fontWeight="bold" fill="white" textAnchor="middle">
      AMEX
    </text>
  </svg>
)

const DiscoverLogo = () => (
  <svg viewBox="0 0 48 32" className="h-8 w-12">
    <rect width="48" height="32" rx="4" fill="#FF6000" />
    <circle cx="36" cy="16" r="8" fill="#FFB300" />
  </svg>
)

const UnknownLogo = () => (
  <svg viewBox="0 0 48 32" className="h-8 w-12">
    <rect width="48" height="32" rx="4" fill="#64748b" />
    <text x="24" y="20" fontSize="10" fontWeight="bold" fill="white" textAnchor="middle">
      CARD
    </text>
  </svg>
)

function CardBrandLogo({ brand }: { brand: string }) {
  switch (brand) {
    case 'Visa':
      return <VisaLogo />
    case 'Mastercard':
      return <MastercardLogo />
    case 'Amex':
      return <AmexLogo />
    case 'Discover':
      return <DiscoverLogo />
    default:
      return <UnknownLogo />
  }
}

export function PaymentCardDisplay({
  card,
  onEdit,
  onDelete,
  isSelectable = false,
  isSelected = false,
  onSelect,
}: PaymentCardDisplayProps) {
  const cardNumber = formatCardNumber(card.lastFourDigits, false)
  const expiryDate = formatExpiryDate(card.expiryMonth, card.expiryYear)

  const handleClick = () => {
    if (isSelectable && onSelect) {
      onSelect(card)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: isSelectable ? 1.02 : 1.05, rotateY: 5 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
      }}
      onClick={handleClick}
      className={`group relative h-52 w-full max-w-sm cursor-pointer select-none rounded-2xl p-6 shadow-xl transition-all ${
        isSelected ? 'ring-4 ring-blue-500 ring-offset-2' : ''
      }`}
      style={{
        background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}dd 100%)`,
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
    >
      {/* Decorative background patterns */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-black/10" />
      </div>

      {/* Card content */}
      <div className="relative flex h-full flex-col justify-between">
        {/* Top section - Brand logo and actions */}
        <div className="flex items-start justify-between">
          {/* EMV Chip */}
          <div className="h-10 w-12 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 shadow-lg">
            <div className="grid h-full grid-cols-3 grid-rows-3 gap-0.5 p-1">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="rounded-sm bg-amber-500/40" />
              ))}
            </div>
          </div>

          {/* Card Brand Logo */}
          <div className="flex-shrink-0">
            <CardBrandLogo brand={card.cardBrand} />
          </div>
        </div>

        {/* Middle section - Card number */}
        <div className="space-y-2">
          <div className="font-mono text-xl font-semibold tracking-wider text-white drop-shadow-lg">
            {cardNumber}
          </div>
          {card.nickname && (
            <div className="text-xs font-medium text-white/80">{card.nickname}</div>
          )}
        </div>

        {/* Bottom section - Cardholder name and expiry */}
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/70">
              Cardholder
            </div>
            <div className="text-sm font-semibold uppercase text-white drop-shadow">
              {card.cardholderName}
            </div>
          </div>

          <div className="space-y-1 text-right">
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/70">
              Expires
            </div>
            <div className="font-mono text-sm font-semibold text-white drop-shadow">
              {expiryDate}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons - Only show on hover if not selectable */}
      {!isSelectable && (onEdit || onDelete) && (
        <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                onEdit(card)
              }}
              className="rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              aria-label="Edit card"
            >
              <Edit className="h-4 w-4" />
            </motion.button>
          )}
          {onDelete && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(card)
              }}
              className="rounded-lg bg-red-500/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-red-500/50"
              aria-label="Delete card"
            >
              <Trash2 className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      )}

      {/* Expense count badge */}
      {card.expenseCount !== undefined && card.expenseCount > 0 && (
        <div className="absolute bottom-4 left-4 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {card.expenseCount} {card.expenseCount === 1 ? 'expense' : 'expenses'}
        </div>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </motion.div>
  )
}
