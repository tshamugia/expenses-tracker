'use client'

/**
 * CategoryTable Component
 * Displays categories in a responsive table
 * Features: Edit/Delete actions, color badges, animations
 */

import { motion } from 'framer-motion'
import { Edit2, Trash2, FolderKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatExpenseDate } from '@/lib/utils/date-helpers'
import type { SerializedCategory } from '@/types/category-types'

interface CategoryTableProps {
  categories: SerializedCategory[]
  onEdit: (category: SerializedCategory) => void
  onDelete: (categoryId: string) => void
  isLoading?: boolean
}

export function CategoryTable({
  categories,
  onEdit,
  onDelete,
  isLoading = false,
}: CategoryTableProps) {
  if (categories.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-600 dark:bg-slate-800"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-700">
            <FolderKanban className="h-8 w-8 text-slate-400" />
          </div>
          <div>
            <p className="text-lg font-medium text-slate-900 dark:text-white">
              No categories found
            </p>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Create your first category to get started organizing your expenses.
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Color</TableHead>
            <TableHead>Category Name</TableHead>
            <TableHead className="hidden sm:table-cell">Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category, index) => (
            <motion.tr
              key={category.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              {/* Color Badge */}
              <TableCell>
                <div
                  className="h-8 w-8 rounded-lg shadow-sm"
                  style={{ backgroundColor: category.color }}
                  title={category.color}
                />
              </TableCell>

              {/* Category Name */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {category.categoryName}
                    </p>
                  </div>
                </div>
              </TableCell>

              {/* Created Date - Hidden on mobile */}
              <TableCell className="hidden sm:table-cell">
                <Badge variant="secondary" className="font-normal">
                  {formatExpenseDate(category.createdAt)}
                </Badge>
              </TableCell>

              {/* Actions */}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(category)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20"
                  >
                    <Edit2 className="h-4 w-4" />
                    <span className="sr-only">Edit {category.categoryName}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(category.id)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete {category.categoryName}</span>
                  </Button>
                </div>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
