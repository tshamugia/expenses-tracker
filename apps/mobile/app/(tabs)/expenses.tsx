import { useState, useCallback, useMemo } from 'react'
import {
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Chip, FAB, Menu, Divider } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useExpenses, useCategories } from '@/lib/hooks'
import { useExpenseFilterStore } from '@/lib/stores/expense-filter-store'
import type { ExpenseStatusFilter } from '@/lib/stores/expense-filter-store'
import { ScreenLoading } from '@/components/screen-loading'
import { ScreenError } from '@/components/screen-error'
import { EmptyState } from '@/components/empty-state'
import { ExpenseCard } from '@/components/expense-card'
import type { ExpenseListItem } from '@extracker/types'

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { label: string; value: ExpenseStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
]

// ---------------------------------------------------------------------------
// Client-side status filtering
// ---------------------------------------------------------------------------

function filterByStatus(
  expenses: ExpenseListItem[],
  status: ExpenseStatusFilter,
): ExpenseListItem[] {
  switch (status) {
    case 'paid':
      return expenses.filter((e) => e.isPaid)
    case 'pending':
      return expenses.filter((e) => !e.isPaid && !e.isOverdue)
    case 'overdue':
      return expenses.filter((e) => e.isOverdue)
    default:
      return expenses
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ExpensesScreen() {
  const router = useRouter()

  // Filter store
  const category = useExpenseFilterStore((s) => s.category)
  const status = useExpenseFilterStore((s) => s.status)
  const setCategory = useExpenseFilterStore((s) => s.setCategory)
  const setStatus = useExpenseFilterStore((s) => s.setStatus)

  // Data queries
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useExpenses({ category })

  const { data: categoriesData } = useCategories()

  // Local UI state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false)

  // Flatten pages and apply client-side status filter
  const filteredExpenses = useMemo(() => {
    if (!data?.pages) return []
    const all = data.pages.flatMap((page) => page.data)
    return filterByStatus(all, status)
  }, [data?.pages, status])

  // Categories list for the dropdown
  const categories = useMemo(
    () => categoriesData?.data ?? [],
    [categoriesData?.data],
  )

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [refetch])

  // Infinite scroll handler
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Render helpers
  const renderItem = useCallback(
    ({ item }: { item: ExpenseListItem }) => (
      <ExpenseCard
        expense={item}
        onPress={() => router.push(`/expense/${item.id}`)}
      />
    ),
    [router],
  )

  const keyExtractor = useCallback((item: ExpenseListItem) => item.id, [])

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#6366F1" />
      </View>
    )
  }, [isFetchingNextPage])

  const renderEmpty = useCallback(() => {
    // Don't show empty state while the initial load is in progress
    if (isLoading) return null

    const isFiltered = status !== 'all' || category !== null

    return (
      <EmptyState
        icon={isFiltered ? 'filter-remove-outline' : 'cash-remove'}
        title={isFiltered ? 'No matching expenses' : 'No expenses yet'}
        description={
          isFiltered
            ? 'Try adjusting your filters to see more results.'
            : 'Add your first expense to start tracking.'
        }
        actionLabel={isFiltered ? undefined : 'Add Expense'}
        onAction={
          isFiltered ? undefined : () => router.push('/expense/create')
        }
      />
    )
  }, [isLoading, status, category, router])

  // ---------------------------------------------------------------------------
  // Loading and error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return <ScreenLoading />
  }

  if (error) {
    return <ScreenError message={error.message} onRetry={refetch} />
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const categoryChipLabel = category ?? 'Category'

  return (
    <View style={styles.container}>
      {/* Filter chips row */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {/* Status filter chips */}
          {STATUS_FILTERS.map((filter) => (
            <Chip
              key={filter.value}
              mode="flat"
              selected={status === filter.value}
              selectedColor="#6366F1"
              onPress={() => setStatus(filter.value)}
              style={[
                styles.chip,
                status === filter.value && styles.chipSelected,
              ]}
              textStyle={[
                styles.chipText,
                status === filter.value && styles.chipTextSelected,
              ]}
              showSelectedOverlay={false}
            >
              {filter.label}
            </Chip>
          ))}

          {/* Category dropdown chip */}
          <Menu
            visible={categoryMenuVisible}
            onDismiss={() => setCategoryMenuVisible(false)}
            anchor={
              <Chip
                mode="flat"
                selected={category !== null}
                selectedColor="#6366F1"
                onPress={() => setCategoryMenuVisible(true)}
                closeIcon="chevron-down"
                onClose={() => setCategoryMenuVisible(true)}
                style={[
                  styles.chip,
                  category !== null && styles.chipSelected,
                ]}
                textStyle={[
                  styles.chipText,
                  category !== null && styles.chipTextSelected,
                ]}
                showSelectedOverlay={false}
              >
                {categoryChipLabel}
              </Chip>
            }
            contentStyle={styles.menuContent}
          >
            <Menu.Item
              onPress={() => {
                setCategory(null)
                setCategoryMenuVisible(false)
              }}
              title="All Categories"
              leadingIcon={category === null ? 'check' : undefined}
              titleStyle={
                category === null ? styles.menuItemActive : undefined
              }
            />
            {categories.length > 0 && <Divider />}
            {categories.map((cat) => (
              <Menu.Item
                key={cat.id}
                onPress={() => {
                  setCategory(cat.categoryName)
                  setCategoryMenuVisible(false)
                }}
                title={cat.categoryName}
                leadingIcon={
                  category === cat.categoryName ? 'check' : undefined
                }
                titleStyle={
                  category === cat.categoryName
                    ? styles.menuItemActive
                    : undefined
                }
              />
            ))}
          </Menu>
        </ScrollView>
      </View>

      {/* Expense list */}
      <FlatList
        data={filteredExpenses}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          filteredExpenses.length === 0 && styles.listContentEmpty,
        ]}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={['#6366F1']}
            tintColor="#6366F1"
          />
        }
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating action button */}
      <FAB
        icon="plus"
        color="#ffffff"
        style={styles.fab}
        onPress={() => router.push('/expense/create')}
        accessibilityLabel="Add new expense"
        accessibilityRole="button"
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // Filter row
  filterRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
  },
  chipSelected: {
    backgroundColor: '#EEF2FF',
  },
  chipText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#6366F1',
    fontWeight: '600',
  },

  // Menu
  menuContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  menuItemActive: {
    color: '#6366F1',
    fontWeight: '600',
  },

  // List
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 96, // extra space for the FAB
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#6366F1',
    borderRadius: 16,
  },
})
