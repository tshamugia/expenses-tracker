'use client'

/**
 * Categories Client Component
 * Handles client-side interactions for category management
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CategoryTable } from '@/components/categories/category-table'
import { CategoryForm, type CategoryFormData } from '@/components/categories/category-form'
import { DeleteConfirmation } from '@/components/expenses/delete-confirmation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { fadeIn } from '@/lib/animations/variants'
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/actions/category-actions'
import type { SerializedCategory } from '@/types/category-types'
import { toast } from 'sonner'

interface CategoriesClientProps {
  initialCategories: SerializedCategory[]
  userId: string
}

export function CategoriesClient({ initialCategories, userId }: CategoriesClientProps) {
  const [categories, setCategories] = useState<SerializedCategory[]>(initialCategories)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<SerializedCategory | null>(null)
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCreateCategory = async (data: CategoryFormData) => {
    setIsSubmitting(true)
    try {
      const result = await createCategory({
        userId,
        categoryName: data.categoryName,
        color: data.color,
      })

      if (result.success && result.data) {
        setCategories((prev) => [result.data!, ...prev])
        setIsFormOpen(false)
        toast.success('Category created successfully!')
      } else {
        toast.error(result.error || 'Failed to create category')
      }
    } catch (error) {
      console.error('Error creating category:', error)
      toast.error('Failed to create category')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditCategory = (category: SerializedCategory) => {
    setEditingCategory(category)
    setIsFormOpen(true)
  }

  const handleUpdateCategory = async (data: CategoryFormData) => {
    if (!editingCategory) return

    setIsSubmitting(true)
    try {
      const result = await updateCategory(editingCategory.id, userId, {
        categoryName: data.categoryName,
        color: data.color,
      })

      if (result.success && result.data) {
        setCategories((prev) =>
          prev.map((cat) => (cat.id === editingCategory.id ? result.data! : cat))
        )
        setIsFormOpen(false)
        setEditingCategory(null)
        toast.success('Category updated successfully!')
      } else {
        toast.error(result.error || 'Failed to update category')
      }
    } catch (error) {
      console.error('Error updating category:', error)
      toast.error('Failed to update category')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFormSubmit = editingCategory
    ? handleUpdateCategory
    : handleCreateCategory

  const handleDeleteCategory = async () => {
    if (!deleteCategoryId) return

    setIsDeleting(true)
    try {
      const result = await deleteCategory(deleteCategoryId, userId)

      if (result.success) {
        setCategories((prev) => prev.filter((cat) => cat.id !== deleteCategoryId))
        setDeleteCategoryId(null)
        toast.success('Category deleted successfully!')
      } else {
        toast.error(result.error || 'Failed to delete category')
      }
    } catch (error) {
      console.error('Error deleting category:', error)
      toast.error('Failed to delete category')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-2">
            Manage your expense categories. Create custom categories with colors to organize
            your expenses.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingCategory(null)
            setIsFormOpen(true)
          }}
          className="shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid gap-4 md:grid-cols-3"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Total Categories
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {categories.length}
          </p>
        </div>
      </motion.div>

      {/* Categories Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <CategoryTable
          categories={categories}
          onEdit={handleEditCategory}
          onDelete={(id) => setDeleteCategoryId(id)}
        />
      </motion.div>

      {/* Form Modal */}
      <CategoryForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          setEditingCategory(null)
        }}
        onSubmit={handleFormSubmit}
        initialData={editingCategory}
        isLoading={isSubmitting}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={deleteCategoryId !== null}
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteCategoryId(null)}
        title="Delete Category?"
        description="This category will be permanently deleted. Note: You cannot delete categories that are currently used by expenses."
        isLoading={isDeleting}
      />
    </div>
  )
}
