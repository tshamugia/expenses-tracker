import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, ScrollView, RefreshControl, StyleSheet, Animated } from 'react-native'
import { Text } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { formatCurrency } from '@extracker/core'
import { useDashboard } from '@/lib/hooks'
import { DashboardSkeleton } from '@/components/skeletons'
import { ScreenError } from '@/components/screen-error'
import { EmptyState } from '@/components/empty-state'
import { StatCard } from '@/components/stat-card'
import { ExpenseCard } from '@/components/expense-card'
import { useAppTheme } from '@/lib/theme/theme-context'
import { AnimatedListItem } from '@/components/animated-list-item'
import type { CategoryData } from '@extracker/types'

const CATEGORY_COLORS = [
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#EF4444',
  '#14B8A6',
]

/**
 * Main dashboard screen showing financial overview.
 *
 * Layout:
 *  - 2x2 stat cards (Total, Paid, Pending, Overdue)
 *  - Upcoming expenses list
 *  - Category breakdown with proportional bars
 */
export default function DashboardScreen() {
  const router = useRouter()
  const { colors } = useAppTheme()
  const { data, isLoading, error, refetch } = useDashboard()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [refetch])

  // Pre-compute the maximum category amount for proportional bar widths
  const maxCategoryAmount = useMemo(() => {
    if (!data?.categoryData?.length) return 0
    return Math.max(...data.categoryData.map((c) => c.amount))
  }, [data?.categoryData])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return <ScreenError message={error.message} onRetry={refetch} />
  }

  const { stats, upcomingExpenses, categoryData } = data ?? {
    stats: { total: 0, paid: 0, pending: 0, overdue: 0, count: 0 },
    upcomingExpenses: [],
    categoryData: [],
  }

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.screenBackground }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[colors.refreshTint]}
          tintColor={colors.refreshTint}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <FadeInView delay={0} style={styles.statsRow}>
          <StatCard
            icon="currency-usd"
            label="Total"
            value={formatCurrency(stats.total)}
            color="#3B82F6"
          />
          <StatCard
            icon="check-circle"
            label="Paid"
            value={formatCurrency(stats.paid)}
            color="#16A34A"
          />
        </FadeInView>
        <FadeInView delay={100} style={styles.statsRow}>
          <StatCard
            icon="clock-outline"
            label="Pending"
            value={formatCurrency(stats.pending)}
            color="#F59E0B"
          />
          <StatCard
            icon="alert-circle"
            label="Overdue"
            value={formatCurrency(stats.overdue)}
            color="#DC2626"
          />
        </FadeInView>
      </View>

      {/* Upcoming Expenses Section */}
      <Text variant="titleMedium" style={[styles.sectionHeader, { color: colors.textPrimary }]}>
        Upcoming Expenses
      </Text>

      {upcomingExpenses.length > 0 ? (
        <View style={styles.expenseList}>
          {upcomingExpenses.map((expense, index) => (
            <AnimatedListItem key={expense.id} index={index}>
              <ExpenseCard
                expense={expense}
                onPress={() => router.push(`/expense/${expense.id}`)}
              />
            </AnimatedListItem>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="calendar-check"
          title="No Upcoming Expenses"
          description="You're all caught up!"
        />
      )}

      {/* By Category Section */}
      <Text variant="titleMedium" style={[styles.sectionHeader, { color: colors.textPrimary }]}>
        By Category
      </Text>

      {categoryData.length > 0 ? (
        <View style={styles.categoryList}>
          {categoryData.map((item, index) => (
            <CategoryRow
              key={item.category}
              item={item}
              color={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              maxAmount={maxCategoryAmount}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="shape"
          title="No Categories"
          description="Expenses will be grouped here"
        />
      )}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Fade-in animation helper
// ---------------------------------------------------------------------------

interface FadeInViewProps {
  delay: number
  style?: object
  children: React.ReactNode
}

function FadeInView({ delay, style, children }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-15)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY, delay])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------
// Category breakdown row
// ---------------------------------------------------------------------------

interface CategoryRowProps {
  item: CategoryData
  color: string
  maxAmount: number
}

function CategoryRow({ item, color, maxAmount }: CategoryRowProps) {
  const { colors } = useAppTheme()

  // Bar fills proportionally relative to the largest category amount.
  // Clamp to a minimum of 8% so small values are still visible.
  const barPercent = maxAmount > 0
    ? Math.max((item.amount / maxAmount) * 100, 8)
    : 0

  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryInfo}>
        <View style={[styles.categoryDot, { backgroundColor: color }]} />
        <Text
          variant="bodyMedium"
          style={[styles.categoryName, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {item.category}
        </Text>
      </View>

      <View style={[styles.categoryBarTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.categoryBarFill,
            { width: `${barPercent}%`, backgroundColor: color },
          ]}
        />
      </View>

      <View style={styles.categoryRight}>
        <Text variant="bodyMedium" style={[styles.categoryAmount, { color: colors.textPrimary }]}>
          {formatCurrency(item.amount)}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: `${color}1A` }]}>
          <Text style={[styles.countText, { color }]}>
            {item.count}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },

  // Stats Grid
  statsGrid: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },

  // Section Headers
  sectionHeader: {
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },

  // Expense List
  expenseList: {
    gap: 12,
  },

  // Category List
  categoryList: {
    gap: 16,
  },

  // Category Row
  categoryRow: {
    gap: 8,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    flex: 1,
    fontWeight: '500',
  },
  categoryBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: 8,
    borderRadius: 4,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryAmount: {
    fontWeight: '600',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
  },
})
