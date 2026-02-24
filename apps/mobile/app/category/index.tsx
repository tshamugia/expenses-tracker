import { useState, useCallback } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { FAB } from 'react-native-paper'
import { ScreenLoading, ScreenError, EmptyState, ConfirmDialog } from '@/components'
import { CategoryCard } from '@/components/category-card'
import { CategoryFormDialog } from '@/components/form/category-form-dialog'
import { useCategories, useDeleteCategory, useSnackbar } from '@/lib/hooks'
import { useAppTheme } from '@/lib/theme/theme-context'
import { AnimatedListItem } from '@/components/animated-list-item'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { hapticMedium, hapticError } from '@/lib/utils/haptics'

interface EditTarget {
  id: string
  categoryName: string
  color: string
}

export default function CategoriesScreen() {
  const { showSnackbar } = useSnackbar()
  const { colors } = useAppTheme()
  const { data, isLoading, isError, error, refetch } = useCategories()
  const deleteCategory = useDeleteCategory()

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const categories = data?.data ?? []

  const handleEdit = useCallback((cat: EditTarget) => {
    setEditTarget(cat)
    setShowForm(true)
  }, [])

  const handleCreate = useCallback(() => {
    setEditTarget(null)
    setShowForm(true)
  }, [])

  const handleDismissForm = useCallback(() => {
    setShowForm(false)
    setEditTarget(null)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return
    deleteCategory.mutate(deleteTarget, {
      onSuccess: () => {
        hapticMedium()
        showSnackbar('Category deleted', 'success')
        setDeleteTarget(null)
      },
      onError: (err) => {
        hapticError()
        showSnackbar(getApiErrorMessage(err, 'Cannot delete — expenses still use this category'), 'error')
        setDeleteTarget(null)
      },
    })
  }, [deleteTarget, deleteCategory, showSnackbar])

  if (isLoading) return <ScreenLoading />
  if (isError) {
    return (
      <ScreenError
        message={getApiErrorMessage(error)}
        onRetry={refetch}
      />
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackgroundSecondary }]}>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index}>
            <CategoryCard
              category={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => setDeleteTarget(item.id)}
            />
          </AnimatedListItem>
        )}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            colors={[colors.refreshTint]}
          />
        }
        contentContainerStyle={
          categories.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          <EmptyState
            icon="shape"
            title="No categories yet"
            description="Create categories to organize your expenses."
            actionLabel="Add Category"
            onAction={handleCreate}
          />
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: colors.fabBackground }]}
        color={colors.fabText}
        onPress={handleCreate}
      />

      <CategoryFormDialog
        visible={showForm}
        onDismiss={handleDismissForm}
        initialValues={editTarget ?? undefined}
      />

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete Category"
        message="Are you sure you want to delete this category? This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteCategory.isPending}
        onConfirm={handleConfirmDelete}
        onDismiss={() => setDeleteTarget(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    borderRadius: 16,
  },
})
