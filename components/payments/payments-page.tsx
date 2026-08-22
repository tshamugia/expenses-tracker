'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, CreditCard, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PaymentCardsList } from './payment-cards-list'
import { PaymentCardForm, type PaymentCardFormData } from './payment-card-form'
import {
  createPaymentCard,
  updatePaymentCard,
  deletePaymentCard,
} from '@/lib/actions/payment-card-actions'
import type { PaymentCardListItem } from '@/types/payment-card-types'
import { toast } from 'sonner'

interface PaymentsPageProps {
  cards: PaymentCardListItem[]
  userId: string
}

export function PaymentsPage({ cards: initialCards, userId }: PaymentsPageProps) {
  const [cards, setCards] = useState<PaymentCardListItem[]>(initialCards)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<PaymentCardListItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleCreateCard = async (data: PaymentCardFormData) => {
    setIsLoading(true)
    try {
      const result = await createPaymentCard({
        userId,
        cardholderName: data.cardholderName,
        cardNumber: data.cardNumber,
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        nickname: data.nickname,
        color: data.color,
      })

      if (result.success && result.data) {
        // Add new card to the list
        setCards((prev) => [
          {
            ...result.data!,
            expenseCount: 0,
          },
          ...prev,
        ])
        toast.success('Payment card added successfully')
        setIsFormOpen(false)
      } else {
        toast.error(result.error || 'Failed to add payment card')
      }
    } catch (error) {
      console.error('Error creating payment card:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateCard = async (data: PaymentCardFormData) => {
    if (!editingCard) return

    setIsLoading(true)
    try {
      const result = await updatePaymentCard(editingCard.id, {
        cardholderName: data.cardholderName,
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        nickname: data.nickname,
        color: data.color,
      })

      if (result.success && result.data) {
        // Update card in the list
        setCards((prev) =>
          prev.map((card) =>
            card.id === editingCard.id
              ? {
                  ...result.data!,
                  expenseCount: card.expenseCount,
                }
              : card
          )
        )
        toast.success('Payment card updated successfully')
        setIsFormOpen(false)
        setEditingCard(null)
      } else {
        toast.error(result.error || 'Failed to update payment card')
      }
    } catch (error) {
      console.error('Error updating payment card:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteCard = async (card: PaymentCardListItem) => {
    if (!confirm(`Are you sure you want to delete the card ending in ${card.lastFourDigits}?`)) {
      return
    }

    try {
      const result = await deletePaymentCard(card.id)

      if (result.success) {
        // Remove card from the list
        setCards((prev) => prev.filter((c) => c.id !== card.id))
        toast.success('Payment card deleted successfully')
      } else {
        toast.error(result.error || 'Failed to delete payment card')
      }
    } catch (error) {
      console.error('Error deleting payment card:', error)
      toast.error('An unexpected error occurred')
    }
  }

  const handleEditCard = (card: PaymentCardListItem) => {
    setEditingCard(card)
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setEditingCard(null)
  }

  const totalCards = cards.length
  const totalExpenses = cards.reduce((sum, card) => sum + (card.expenseCount || 0), 0)
  const mostUsedCard = cards.reduce((max, card) =>
    (card.expenseCount || 0) > (max.expenseCount || 0) ? card : max
  , cards[0])

  return (
    <div className="space-y-8">
      {/* Header with Stats */}
      <div className="space-y-6">
        {/* Title and Add Button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              Payment Cards
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              Manage your credit and debit cards for expense tracking
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full sm:w-auto">
            <Button
              onClick={() => setIsFormOpen(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Card
            </Button>
          </motion.div>
        </div>

        {/* Stats Cards */}
        {totalCards > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Total Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-100">Total Cards</p>
                  <p className="mt-2 text-3xl font-bold">{totalCards}</p>
                </div>
                <div className="rounded-lg bg-white/20 p-3">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
            </motion.div>

            {/* Total Expenses Linked */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-100">Linked Expenses</p>
                  <p className="mt-2 text-3xl font-bold">{totalExpenses}</p>
                </div>
                <div className="rounded-lg bg-white/20 p-3">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>
            </motion.div>

            {/* Most Used Card */}
            {mostUsedCard && (mostUsedCard.expenseCount || 0) > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-lg"
              >
                <div>
                  <p className="text-sm font-medium text-green-100">Most Used</p>
                  <p className="mt-2 text-lg font-bold">
                    {mostUsedCard.nickname || `${mostUsedCard.cardBrand} ••${mostUsedCard.lastFourDigits}`}
                  </p>
                  <p className="mt-1 text-sm text-green-100">
                    {mostUsedCard.expenseCount} {mostUsedCard.expenseCount === 1 ? 'expense' : 'expenses'}
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Cards List */}
      <PaymentCardsList
        cards={cards}
        onEdit={handleEditCard}
        onDelete={handleDeleteCard}
      />

      {/* Card Form Modal */}
      <PaymentCardForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={editingCard ? handleUpdateCard : handleCreateCard}
        initialData={editingCard}
        isLoading={isLoading}
      />
    </div>
  )
}
