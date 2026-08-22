'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { modalBackdrop } from '@/lib/animations/variants'

interface DeleteConfirmationProps {
  isOpen: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
  title?: string
  description?: string
  isLoading?: boolean
}

export function DeleteConfirmation({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Delete Expense?',
  description = 'This action cannot be undone. The expense and all associated payments will be permanently deleted.',
  isLoading = false,
}: DeleteConfirmationProps) {
  const handleConfirm = async () => {
    await onConfirm()
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
            onClick={onCancel}
          />

          {/* Dialog Container - Centered */}
          <motion.div
            key="dialog-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onCancel}
          >
            {/* Dialog Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 30,
              }}
              className="relative w-full max-w-sm rounded-2xl bg-gradient-to-br from-white to-slate-50 shadow-2xl dark:from-slate-800 dark:to-slate-900 border border-white/20 dark:border-slate-700/50 p-6 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative background */}
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-red-400/10 rounded-full blur-3xl dark:bg-red-500/5" />

              {/* Icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-900/20 border-2 border-red-200 dark:border-red-800/30"
              >
                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </motion.div>

              {/* Content */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-center"
              >
                <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">
                  {title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {description}
                </p>
              </motion.div>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-3 mt-8"
              >
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isLoading}
                  className="flex-1 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 font-semibold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-red-500 px-4 py-2.5 font-semibold text-white shadow-lg hover:shadow-xl hover:from-red-700 hover:to-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Deleting...' : 'Delete'}
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
