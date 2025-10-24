'use client'

import { motion } from 'framer-motion'
import { CreditCard } from 'lucide-react'
import { PaymentCardDisplay } from './payment-card-display'
import type { PaymentCardListItem } from '@/types/payment-card-types'

interface PaymentCardsListProps {
  cards: PaymentCardListItem[]
  onEdit: (card: PaymentCardListItem) => void
  onDelete: (card: PaymentCardListItem) => void
  isLoading?: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      <div className="mb-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 p-8">
        <CreditCard className="h-16 w-16 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
        No Payment Cards Yet
      </h3>
      <p className="max-w-sm text-slate-600 dark:text-slate-400">
        Add your first payment card to start tracking which cards are used for your expenses and subscriptions.
      </p>
    </motion.div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-52 w-full animate-pulse rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700"
        />
      ))}
    </div>
  )
}

export function PaymentCardsList({
  cards,
  onEdit,
  onDelete,
  isLoading = false,
}: PaymentCardsListProps) {
  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (!cards || cards.length === 0) {
    return <EmptyState />
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {cards.map((card) => (
        <motion.div key={card.id} variants={itemVariants}>
          <PaymentCardDisplay
            card={card}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}
