import { View, StyleSheet } from 'react-native'
import { Surface } from 'react-native-paper'
import { Skeleton } from '../skeleton'
import { useAppTheme } from '@/lib/theme/theme-context'

export function DashboardSkeleton() {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackground }]}>
      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCardSkeleton />
          <StatCardSkeleton />
        </View>
        <View style={styles.statsRow}>
          <StatCardSkeleton />
          <StatCardSkeleton />
        </View>
      </View>

      {/* Section Header */}
      <Skeleton width={140} height={18} style={styles.sectionHeader} />

      {/* Expense Cards */}
      {[1, 2, 3].map((i) => (
        <ExpenseCardSkeleton key={i} />
      ))}

      {/* Category Section Header */}
      <Skeleton width={120} height={18} style={styles.sectionHeader} />

      {/* Category Rows */}
      {[1, 2, 3].map((i) => (
        <CategoryRowSkeleton key={i} />
      ))}
    </View>
  )
}

function StatCardSkeleton() {
  const { colors } = useAppTheme()
  return (
    <Surface style={[styles.statCard, { backgroundColor: colors.cardBackground }]} elevation={1}>
      <Skeleton width={36} height={36} borderRadius={18} />
      <Skeleton width={60} height={12} style={{ marginTop: 8 }} />
      <Skeleton width={80} height={20} style={{ marginTop: 4 }} />
    </Surface>
  )
}

function ExpenseCardSkeleton() {
  const { colors } = useAppTheme()
  return (
    <Surface style={[styles.expenseCard, { backgroundColor: colors.cardBackground }]} elevation={1}>
      <View style={styles.expenseCardContent}>
        <View style={styles.expenseCardLeft}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={styles.expenseCardText}>
            <Skeleton width={120} height={14} />
            <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={styles.expenseCardRight}>
          <Skeleton width={70} height={16} />
          <Skeleton width={50} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
    </Surface>
  )
}

function CategoryRowSkeleton() {
  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryInfo}>
        <Skeleton width={12} height={12} borderRadius={6} />
        <Skeleton width={100} height={14} />
      </View>
      <Skeleton width="100%" height={8} borderRadius={4} />
      <View style={styles.categoryRight}>
        <Skeleton width={70} height={14} />
        <Skeleton width={28} height={20} borderRadius={10} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingBottom: 32,
  },
  statsGrid: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
  },
  expenseCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  expenseCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expenseCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expenseCardText: {
    gap: 0,
  },
  expenseCardRight: {
    alignItems: 'flex-end',
  },
  categoryRow: {
    gap: 8,
    marginBottom: 16,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
