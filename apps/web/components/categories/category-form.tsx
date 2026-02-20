'use client'

/**
 * CategoryForm Component
 * Modal form for creating and editing categories
 * Features: Color picker, validation, animations
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, FolderKanban } from 'lucide-react'
import { modalBackdrop, formFieldEntry } from '@/lib/animations/variants'
import type { SerializedCategory } from '@extracker/types'

interface CategoryFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CategoryFormData) => Promise<void>
  initialData?: SerializedCategory | null
  isLoading?: boolean
}

export interface CategoryFormData {
  categoryName: string
  color: string
}

// Predefined color palette
const COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
]

export function CategoryForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}: CategoryFormProps) {
  const [formData, setFormData] = useState<CategoryFormData>({
    categoryName: '',
    color: '#3b82f6',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Update form data when initialData changes (for editing)
  useEffect(() => {
    if (isOpen && initialData) {
      // Editing mode - pre-fill with category data
      setFormData({
        categoryName: initialData.categoryName || '',
        color: initialData.color || '#3b82f6',
      })
    } else if (isOpen && !initialData) {
      // Create mode - reset to defaults
      setFormData({
        categoryName: '',
        color: '#3b82f6',
      })
    }
    // Reset errors and touched when modal opens
    setErrors({})
    setTouched({})
  }, [isOpen, initialData])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.categoryName.trim()) {
      newErrors.categoryName = 'Category name is required'
    } else if (formData.categoryName.trim().length > 50) {
      newErrors.categoryName = 'Category name must be less than 50 characters'
    }

    if (!formData.color) {
      newErrors.color = 'Color is required'
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
      handleClose()
    } catch (error) {
      console.error('Form submission error:', error)
    }
  }

  const handleClose = () => {
    setFormData({
      categoryName: '',
      color: '#3b82f6',
    })
    setErrors({})
    setTouched({})
    onClose()
  }

  const handleFieldChange = (field: keyof CategoryFormData, value: string) => {
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

  const handleFieldBlur = (field: keyof CategoryFormData) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }))
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
              className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-white to-slate-50 shadow-2xl dark:from-slate-800 dark:to-slate-900 border border-white/20 dark:border-slate-700/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative background elements */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-400/10 rounded-full blur-3xl dark:bg-blue-500/5" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-400/10 rounded-full blur-3xl dark:bg-purple-500/5" />

              {/* Content wrapper with padding */}
              <div className="relative p-8">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-2.5 rounded-xl shadow-lg"
                      style={{
                        backgroundColor: formData.color,
                        color: 'white',
                      }}
                    >
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                      {initialData ? 'Edit Category' : 'Add Category'}
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
                  {/* Category Name */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.1 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Category Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="e.g., Food & Dining, Transportation..."
                        value={formData.categoryName}
                        onChange={(e) => handleFieldChange('categoryName', e.target.value)}
                        onBlur={() => handleFieldBlur('categoryName')}
                        className={`w-full rounded-lg border-2 transition-all duration-200 ${
                          touched.categoryName && errors.categoryName
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/10 focus:ring-red-500'
                            : 'border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:border-blue-500 focus:ring-blue-500'
                        }`}
                      />
                    </div>
                    {touched.categoryName && errors.categoryName && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.categoryName}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Color Picker */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.15 }}
                    className="group"
                  >
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Color <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-8 gap-2">
                      {COLOR_PALETTE.map((color) => (
                        <motion.button
                          key={color}
                          type="button"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleFieldChange('color', color)}
                          className={`h-10 w-10 rounded-lg transition-all ${
                            formData.color === color
                              ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-slate-100 ring-offset-white dark:ring-offset-slate-900'
                              : 'hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    {touched.color && errors.color && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-sm font-medium text-red-500"
                      >
                        {errors.color}
                      </motion.p>
                    )}
                  </motion.div>

                  {/* Actions */}
                  <motion.div
                    variants={formFieldEntry}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: 0.2 }}
                    className="flex gap-3 pt-6"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isLoading}
                      className="flex-1 rounded-lg border-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </Button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: formData.color,
                        color: 'white',
                      }}
                    >
                      <FolderKanban className="h-4 w-4" />
                      {isLoading
                        ? 'Saving...'
                        : initialData
                        ? 'Update Category'
                        : 'Add Category'}
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
