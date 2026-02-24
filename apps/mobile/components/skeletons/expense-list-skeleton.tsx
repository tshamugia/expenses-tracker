import { View, ScrollView, StyleSheet } from 'react-native'
import { Surface } from 'react-native-paper'
import { Skeleton } from '../skeleton'
import { useAppTheme } from '@/lib/theme/theme-context'

export function ExpenseListSkeleton() {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackground }]}>
      {/* Filter Chips */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {[60, 50, 65, 80].map((w, i) => (
            <Skeleton key={i} width={w} height={32} borderRadius={16} />
          ))}
        </ScrollView>
      </View>

      {/* Expense Cards */}
      <View style={styles.listContent}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Surface key={i} style={[styles.expenseCard, { backgroundColor: colors.cardBackground }]} elevation={1}>
            <View style={styles.cardRow}>
              <View style={styles.cardLeft}>
                <Skeleton width={40} height={40} borderRadius={20} />
                <View>
                  <Skeleton width={120} height={14} />
                  <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
                </View>
              </View>
              <View style={styles.cardRight}>
                <Skeleton width={70} height={16} />
                <Skeleton width={50} height={12} style={{ marginTop: 4 }} />
              </View>
            </View>
          </Surface>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  expenseCard: {
    borderRadius: 12,
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
})
