'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Plus, FolderPlus, CreditCard } from 'lucide-react'
import {
  modalBackdrop,
  formFieldEntry,
} from '@/lib/animations/variants'
import type { ExpenseListItem } from '@/types/expense-types'
import type { SerializedCategory } from '@/types/category-types'
import type { SerializedPaymentCard } from '@/types/payment-card-types'
import { getUserCategories, createCategory } from '@/lib/actions/category-actions'
import { getUserPaymentCards, createPaymentCard } from '@/lib/actions/payment-card-actions'
import { CategoryForm, type CategoryFormData } from '@/components/categories/category-form'
import { PaymentCardForm, type PaymentCardFormData } from '@/components/payments/payment-card-form'
import { IconPicker, ExpenseIcon } from './expense-icons'
import { toast } from 'sonner'

interface ExpenseFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: ExpenseFormData) => Promise<void>
  initialData?: ExpenseListItem | null
  isLoading?: boolean
  userId: string
}

export type RecurrenceOption = 'none' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface ExpenseFormData {
  title: string
  amount: number
  currency?: string
  category: string
  icon?: string | null
  date: string
  notes?: string
  paymentCardId?: string
  recurrence?: RecurrenceOption
}

// Map a stored RRULE string to the form's recurrence option
function recurrenceFromRule(rule: string | null | undefined): RecurrenceOption {
  if (!rule) return 'none'
  if (/FREQ=WEEKLY/i.test(rule)) return 'WEEKLY'
  if (/FREQ=MONTHLY/i.test(rule)) return 'MONTHLY'
  if (/FREQ=YEARLY/i.test(rule)) return 'YEARLY'
  return 'none'
}

export function ExpenseForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
  userId,
}: ExpenseFormProps) {
  const [formData, setFormData] = useState<ExpenseFormData>({
    title: '',
    amount: 0,
    currency: 'GEL',
    category: '',
    icon: null,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    paymentCardId: 'none',
    recurrence: 'none',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [categories, setCategories] = useState<SerializedCategory[]>([])
  const [paymentCards, setPaymentCards] = useState<SerializedPaymentCard[]>([])
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false)
  const [isPaymentCardFormOpen, setIsPaymentCardFormOpen] = useState(false)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [isCreatingPaymentCard, setIsCreatingPaymentCard] = useState(false)
  const [isFetchingCategories, setIsFetchingCategories] = useState(false)
  const [isFetchingCards, setIsFetchingCards] = useState(false)

  // Fetch categories and payment cards when modal opens
  useEffect(() => {
    const fetchData = async () => {
      if (isOpen && userId) {
        // Fetch categories
        setIsFetchingCategories(true)
        try {
          const fetchedCategories = await getUserCategories(userId)
          setCategories(fetchedCategories)
        } catch (error) {
          console.error('Error fetching categories:', error)
          toast.error('Failed to load categories')
        } finally {
          setIsFetchingCategories(false)
        }

        // Fetch payment cards
        setIsFetchingCards(true)
        try {
          const fetchedCards = await getUserPaymentCards(userId)
          setPaymentCards(fetchedCards)
        } catch (error) {
          console.error('Error fetching payment cards:', error)
          toast.error('Failed to load payment cards')
        } finally {
          setIsFetchingCards(false)
        }
      }
    }

    fetchData()
  }, [isOpen, userId])

  // Update form data when initialData changes (for editing)
  // Wait for categories and payment cards to be loaded first
  useEffect(() => {
    // Only update form data after categories and cards are loaded (or if we're not fetching)
    const canSetFormData = !isFetchingCategories && !isFetchingCards

    if (isOpen && canSetFormData) {
      if (initialData) {
        // Editing mode - pre-fill with expense data
        const formattedDate = initialData.nextDueDate
          ? new Date(initialData.nextDueDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]

        setFormData({
          title: initialData.title || '',
          amount: initialData.amount || 0,
          currency: initialData.currency || 'GEL',
          category: initialData.category || '',
          icon: initialData.icon ?? null,
          date: formattedDate,
          notes: '',
          paymentCardId: initialData.paymentCard?.id || 'none',
          recurrence: recurrenceFromRule(initialData.recurrenceRule),
        })
      } else {
        // Create mode - reset to defaults
        setFormData({
          title: '',
          amount: 0,
          currency: 'GEL',
          category: '',
          icon: null,
          date: new Date().toISOString().split('T')[0],
          notes: '',
          paymentCardId: 'none',
          recurrence: 'none',
        })
      }
      // Reset errors and touched when modal opens
      setErrors({})
      setTouched({})
    }
  }, [isOpen, initialData, isFetchingCategories, isFetchingCards])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Expense name is required'
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }

    if (!formData.category) {
      newErrors.category = 'Category is required'
    }

    if (!formData.date) {
      newErrors.date = 'Date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      await onSubmit(formData)
      handleReset()
      onClose()
    } catch (error) {
      console.error('Form submission error:', error)
    }
  }

  const handleReset = () => {
    setFormData({
      title: '',
      amount: 0,
      currency: 'GEL',
      category: '',
      icon: null,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      paymentCardId: 'none',
      recurrence: 'none',
    })
    setErrors({})
    setTouched({})
  }

  const handleFieldChange = (field: keyof ExpenseFormData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))

    if (touched[field] && errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleFieldBlur = (field: keyof ExpenseFormData) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }))
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const handleCreateCategory = async (data: CategoryFormData) => {
    setIsCreatingCategory(true)
    try {
      const result = await createCategory({
        userId,
        categoryName: data.categoryName,
        color: data.color,
      })

      if (result.success && result.data) {
        // Add new category to list
        setCategories((prev) => [result.data!, ...prev])
        // Auto-select the newly created category
        setFormData((prev) => ({
          ...prev,
          category: result.data!.categoryName,
        }))
        toast.success('Category created successfully')
        setIsCategoryFormOpen(false)
      } else {
        toast.error(result.error || 'Failed to create category')
      }
    } catch (error) {
      console.error('Error creating category:', error)
      toast.error('Failed to create category')
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleCreatePaymentCard = async (data: PaymentCardFormData) => {
    setIsCreatingPaymentCard(true)
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
        // Add new payment card to list
        setPaymentCards((prev) => [result.data!, ...prev])
        // Auto-select the newly created payment card
        setFormData((prev) => ({
          ...prev,
          paymentCardId: result.data!.id,
        }))
        toast.success('Payment card added successfully')
        setIsPaymentCardFormOpen(false)
      } else {
        toast.error(result.error || 'Failed to add payment card')
      }
    } catch (error) {
      console.error('Error creating payment card:', error)
      toast.error('Failed to add payment card')
    } finally {
      setIsCreatingPaymentCard(false)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xl"
            onClick={handleClose}
          />

          {/* Modal Container - Centered */}
          <motion.div
            key="modal-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleClose}
          >
            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 30,
                mass: 0.5,
              }}
              className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto overflow-x-hidden rounded-2xl bg-gradient-to-br from-white to-slate-50 shadow-2xl dark:from-slate-800 dark:to-slate-900 border border-white/20 dark:border-slate-700/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative background elements */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-400/10 rounded-full blur-3xl dark:bg-blue-500/5" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-400/10 rounded-full blur-3xl dark:bg-purple-500/5" />

              {/* Content wrapper with padding */}
              <div className="relative p-5 sm:p-8">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between sm:mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
                      <Plus className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 sm:text-2xl">
                      {initialData ? 'Edit Expense' : 'Add Expense'}
                    </h2>
                  </div>
                  <motion.button
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClose}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </motion.button>
                </div>

                {/* Form - Add key to force re-render when editing different expenses */}
                <form
                  key={initialData?.id || 'new'}
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  {/* Expense Name */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.1 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Expense Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="e.g., Groceries, Gas..."
                        value={formData.title}
                        onChange={(e) => handleFieldChange('title', e.target.value)}
                        onBlur={() => handleFieldBlur('title')}
                        className={`w-full rounded-lg border-2 transition-all duration-200 ${
                          touched.title && errors.title
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/10 focus:ring-red-500'
                            : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500'
                        }`}
                      />
                    </div>
                    {touched.title && errors.title && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.title}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Amount */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.15 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">
                        {formData.currency === 'USD' ? '$' : formData.currency === 'EUR' ? '€' : '₾'}
                      </span>
                      <Input
                        type="number"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        value={formData.amount || ''}
                        onChange={(e) =>
                          handleFieldChange('amount', parseFloat(e.target.value) || 0)
                        }
                        onBlur={() => handleFieldBlur('amount')}
                        className={`w-full pl-9 rounded-lg border-2 transition-all duration-200 ${
                          touched.amount && errors.amount
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/10 focus:ring-red-500'
                            : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500'
                        }`}
                      />
                    </div>
                    {touched.amount && errors.amount && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.amount}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Currency Selector */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.2 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Currency
                    </label>
                    <Select
                      value={formData.currency || 'GEL'}
                      onValueChange={(value) => handleFieldChange('currency', value)}
                    >
                      <SelectTrigger className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GEL">₾ GEL - Georgian Lari</SelectItem>
                        <SelectItem value="USD">$ USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">€ EUR - Euro</SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>

                  {/* Category */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.25 }}
                    className="group"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsCategoryFormOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        New Category
                      </motion.button>
                    </div>
                    <Select
                      value={formData.category || undefined}
                      onValueChange={(value) => handleFieldChange('category', value)}
                      disabled={isFetchingCategories}
                    >
                      <SelectTrigger
                        className={`rounded-lg border-2 transition-all duration-200 ${
                          touched.category && errors.category
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/10 focus:ring-red-500'
                            : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500'
                        }`}
                      >
                        <SelectValue
                          placeholder={
                            isFetchingCategories
                              ? "Loading categories..."
                              : categories.length === 0
                              ? "No categories - create one"
                              : "Select a category"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.length === 0 ? (
                          <div className="px-2 py-6 text-center text-sm text-slate-500">
                            <p>No categories yet</p>
                            <button
                              type="button"
                              onClick={() => setIsCategoryFormOpen(true)}
                              className="mt-2 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              Create your first category
                            </button>
                          </div>
                        ) : (
                          categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.categoryName}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: cat.color }}
                                />
                                {cat.categoryName}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {touched.category && errors.category && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.category}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Icon / Logo */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.24 }}
                    className="group"
                  >
                    <div className="mb-2.5 flex items-center gap-2">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Icon <span className="text-slate-400">(Optional)</span>
                      </label>
                      {formData.icon && <ExpenseIcon slug={formData.icon} size={24} />}
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 p-3">
                      <IconPicker
                        value={formData.icon}
                        onChange={(slug) =>
                          setFormData((prev) => ({ ...prev, icon: slug }))
                        }
                      />
                    </div>
                  </motion.div>

                  {/* Payment Card */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.225 }}
                    className="group"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Payment Card <span className="text-slate-400">(Optional)</span>
                      </label>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsPaymentCardFormOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        New Card
                      </motion.button>
                    </div>
                    <Select
                      value={formData.paymentCardId || undefined}
                      onValueChange={(value) => handleFieldChange('paymentCardId', value)}
                      disabled={isFetchingCards}
                    >
                      <SelectTrigger
                        className="rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200"
                      >
                        <SelectValue
                          placeholder={
                            isFetchingCards
                              ? "Loading cards..."
                              : paymentCards.length === 0
                              ? "No cards - create one"
                              : "Select a card (optional)"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentCards.length === 0 ? (
                          <div className="px-2 py-6 text-center text-sm text-slate-500">
                            <p>No payment cards yet</p>
                            <button
                              type="button"
                              onClick={() => setIsPaymentCardFormOpen(true)}
                              className="mt-2 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              Create your first card
                            </button>
                          </div>
                        ) : (
                          <>
                            <SelectItem value="none">
                              <div className="flex items-center gap-2 text-slate-500">
                                <CreditCard className="h-4 w-4" />
                                No card
                              </div>
                            </SelectItem>
                            {paymentCards.map((card) => (
                              <SelectItem key={card.id} value={card.id}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: card.color }}
                                  />
                                  <span className="font-medium">{card.cardBrand}</span>
                                  <span className="text-slate-500">••{card.lastFourDigits}</span>
                                  {card.nickname && (
                                    <span className="text-xs text-slate-400">({card.nickname})</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </motion.div>

                  {/* Date */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.25 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => handleFieldChange('date', e.target.value)}
                      onBlur={() => handleFieldBlur('date')}
                      className={`w-full rounded-lg border-2 transition-all duration-200 ${
                        touched.date && errors.date
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/10 focus:ring-red-500'
                          : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                    />
                    {touched.date && errors.date && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.date}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Repeat / Recurrence */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.275 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Repeat
                    </label>
                    <Select
                      value={formData.recurrence || 'none'}
                      onValueChange={(value) => handleFieldChange('recurrence', value)}
                    >
                      <SelectTrigger className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Does not repeat</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="YEARLY">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.recurrence && formData.recurrence !== 'none' && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        After you mark it paid, the next payment is scheduled automatically.
                      </p>
                    )}
                  </motion.div>

                  {/* Notes */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.3 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Notes <span className="text-slate-400">(Optional)</span>
                    </label>
                    <textarea
                      placeholder="Add any notes about this expense..."
                      value={formData.notes || ''}
                      onChange={(e) => handleFieldChange('notes', e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none transition-all duration-200"
                    />
                  </motion.div>

                  {/* Actions */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.35 }}
                    className="flex flex-col-reverse gap-3 pt-6 sm:flex-row"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isLoading}
                      className="h-11 flex-1 rounded-lg border-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </Button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-blue-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      {isLoading ? 'Saving...' : initialData ? 'Update Expense' : 'Add Expense'}
                    </motion.button>
                  </motion.div>
                </form>
              </div>
            </motion.div>
          </motion.div>

          {/* Category Form Modal */}
          <CategoryForm
            isOpen={isCategoryFormOpen}
            onClose={() => setIsCategoryFormOpen(false)}
            onSubmit={handleCreateCategory}
            isLoading={isCreatingCategory}
          />

          {/* Payment Card Form Modal */}
          <PaymentCardForm
            isOpen={isPaymentCardFormOpen}
            onClose={() => setIsPaymentCardFormOpen(false)}
            onSubmit={handleCreatePaymentCard}
            isLoading={isCreatingPaymentCard}
          />
        </>
      )}
    </AnimatePresence>
  )
}
