'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, CreditCard } from 'lucide-react'
import { modalBackdrop, formFieldEntry } from '@/lib/animations/variants'
import { validateCardNumber, formatCardNumber, detectCardBrand } from '@extracker/core'
import type { PaymentCardListItem } from '@extracker/types'

interface PaymentCardFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PaymentCardFormData) => Promise<void>
  initialData?: PaymentCardListItem | null
  isLoading?: boolean
}

export interface PaymentCardFormData {
  cardholderName: string
  cardNumber: string
  expiryMonth: number
  expiryYear: number
  nickname?: string
  color: string
}

const CARD_COLORS = [
  { name: 'Blue', value: '#1e40af' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Green', value: '#059669' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Slate', value: '#475569' },
  { name: 'Black', value: '#18181b' },
]

export function PaymentCardForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}: PaymentCardFormProps) {
  const currentYear = new Date().getFullYear()

  const [formData, setFormData] = useState<PaymentCardFormData>({
    cardholderName: '',
    cardNumber: '',
    expiryMonth: new Date().getMonth() + 1,
    expiryYear: currentYear,
    nickname: '',
    color: '#1e40af',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [cardBrand, setCardBrand] = useState<string>('Unknown')

  // Update form data when initialData changes (for editing)
  useEffect(() => {
    if (isOpen && initialData) {
      // Editing mode - pre-fill with card data
      setFormData({
        cardholderName: initialData.cardholderName || '',
        cardNumber: initialData.lastFourDigits, // Only last 4 for editing
        expiryMonth: initialData.expiryMonth || new Date().getMonth() + 1,
        expiryYear: initialData.expiryYear || currentYear,
        nickname: initialData.nickname || '',
        color: initialData.color || '#1e40af',
      })
      setCardBrand(initialData.cardBrand)
    } else if (isOpen && !initialData) {
      // Create mode - reset to defaults
      setFormData({
        cardholderName: '',
        cardNumber: '',
        expiryMonth: new Date().getMonth() + 1,
        expiryYear: currentYear,
        nickname: '',
        color: '#1e40af',
      })
      setCardBrand('Unknown')
    }
    // Reset errors and touched when modal opens
    setErrors({})
    setTouched({})
  }, [isOpen, initialData, currentYear])

  // Detect card brand as user types
  useEffect(() => {
    if (formData.cardNumber.length >= 2) {
      const brand = detectCardBrand(formData.cardNumber)
      setCardBrand(brand)
    } else {
      setCardBrand('Unknown')
    }
  }, [formData.cardNumber])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    // Cardholder name
    if (!formData.cardholderName.trim()) {
      newErrors.cardholderName = 'Cardholder name is required'
    } else if (formData.cardholderName.length < 2 || formData.cardholderName.length > 50) {
      newErrors.cardholderName = 'Name must be 2-50 characters'
    }

    // Card number (only validate if not editing)
    if (!initialData) {
      const validation = validateCardNumber(formData.cardNumber)
      if (!validation.isValid) {
        newErrors.cardNumber = validation.error || 'Invalid card number'
      }
    } else if (formData.cardNumber.length !== 4) {
      newErrors.cardNumber = 'Last 4 digits required'
    }

    // Expiry date
    const currentDate = new Date()
    const currentMonth = currentDate.getMonth() + 1
    const currentYearNow = currentDate.getFullYear()

    if (formData.expiryYear < currentYearNow) {
      newErrors.expiryDate = 'Card is expired'
    } else if (formData.expiryYear === currentYearNow && formData.expiryMonth < currentMonth) {
      newErrors.expiryDate = 'Card is expired'
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
      cardholderName: '',
      cardNumber: '',
      expiryMonth: new Date().getMonth() + 1,
      expiryYear: currentYear,
      nickname: '',
      color: '#1e40af',
    })
    setErrors({})
    setTouched({})
    setCardBrand('Unknown')
  }

  const handleFieldChange = (field: keyof PaymentCardFormData, value: string | number) => {
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

  const handleFieldBlur = (field: keyof PaymentCardFormData) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }))
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const handleCardNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove all non-digits
    const value = e.target.value.replace(/\D/g, '')
    // Limit to 19 digits (max card length)
    const limited = value.slice(0, 19)
    handleFieldChange('cardNumber', limited)
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

          {/* Modal Container */}
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
              className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-white to-slate-50 shadow-2xl dark:from-slate-800 dark:to-slate-900 border border-white/20 dark:border-slate-700/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative background */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-400/10 rounded-full blur-3xl dark:bg-blue-500/5" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-400/10 rounded-full blur-3xl dark:bg-purple-500/5" />

              {/* Content wrapper */}
              <div className="relative p-8">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                      {initialData ? 'Edit Card' : 'Add Card'}
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

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Card Number */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.1 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Card Number <span className="text-red-500">*</span>
                      {cardBrand !== 'Unknown' && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                          {cardBrand} detected
                        </span>
                      )}
                    </label>
                    <Input
                      type="text"
                      placeholder={initialData ? 'Last 4 digits' : '1234 5678 9012 3456'}
                      value={formData.cardNumber}
                      onChange={handleCardNumberInput}
                      onBlur={() => handleFieldBlur('cardNumber')}
                      maxLength={initialData ? 4 : 19}
                      disabled={!!initialData}
                      className={`w-full rounded-lg border-2 transition-all duration-200 ${
                        touched.cardNumber && errors.cardNumber
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                          : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50'
                      }`}
                    />
                    {touched.cardNumber && errors.cardNumber && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.cardNumber}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Cardholder Name */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.15 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Cardholder Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="John Doe"
                      value={formData.cardholderName}
                      onChange={(e) => handleFieldChange('cardholderName', e.target.value)}
                      onBlur={() => handleFieldBlur('cardholderName')}
                      className={`w-full rounded-lg border-2 transition-all duration-200 ${
                        touched.cardholderName && errors.cardholderName
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                          : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50'
                      }`}
                    />
                    {touched.cardholderName && errors.cardholderName && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.cardholderName}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Expiry Date */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.2 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Expiry Date <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Input
                          type="number"
                          placeholder="MM"
                          min="1"
                          max="12"
                          value={formData.expiryMonth}
                          onChange={(e) => handleFieldChange('expiryMonth', parseInt(e.target.value) || 1)}
                          className={`w-full rounded-lg border-2 transition-all duration-200 ${
                            errors.expiryDate
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                              : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50'
                          }`}
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          placeholder="YYYY"
                          min={currentYear}
                          max={currentYear + 20}
                          value={formData.expiryYear}
                          onChange={(e) => handleFieldChange('expiryYear', parseInt(e.target.value) || currentYear)}
                          className={`w-full rounded-lg border-2 transition-all duration-200 ${
                            errors.expiryDate
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                              : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50'
                          }`}
                        />
                      </div>
                    </div>
                    {errors.expiryDate && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.expiryDate}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Nickname */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.25 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Nickname <span className="text-slate-400">(Optional)</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g., Personal Card, Work Card"
                      value={formData.nickname || ''}
                      onChange={(e) => handleFieldChange('nickname', e.target.value)}
                      className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50"
                    />
                  </motion.div>

                  {/* Card Color */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.3 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Card Color
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {CARD_COLORS.map((colorOption) => (
                        <button
                          key={colorOption.value}
                          type="button"
                          onClick={() => handleFieldChange('color', colorOption.value)}
                          className={`h-10 rounded-lg transition-all ${
                            formData.color === colorOption.value
                              ? 'ring-4 ring-blue-500 ring-offset-2 scale-110'
                              : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: colorOption.value }}
                          aria-label={colorOption.name}
                        />
                      ))}
                    </div>
                  </motion.div>

                  {/* Actions */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.35 }}
                    className="flex gap-3 pt-6"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isLoading}
                      className="flex-1 rounded-lg border-2 font-semibold"
                    >
                      Cancel
                    </Button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 py-2.5"
                    >
                      {isLoading ? 'Saving...' : initialData ? 'Update Card' : 'Add Card'}
                    </motion.button>
                  </motion.div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
