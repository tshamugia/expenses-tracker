import { View, StyleSheet } from 'react-native'
import { Surface } from 'react-native-paper'
import { Skeleton } from '../skeleton'
import { useAppTheme } from '@/lib/theme/theme-context'

export function ExpenseDetailSkeleton() {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackground }]}>
      {/* Amount Section */}
      <View style={styles.amountSection}>
        <Skeleton width={150} height={36} borderRadius={8} />
        <Skeleton width={60} height={24} borderRadius={12} style={{ marginTop: 8 }} />
        <Skeleton width={40} height={14} style={{ marginTop: 8 }} />
      </View>

      {/* Details Card */}
      <Surface style={[styles.detailsCard, { backgroundColor: colors.cardBackground }]} elevation={1}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i}>
            {i > 1 && <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
            <View style={styles.detailRow}>
              <Skeleton width={70} height={12} />
              <Skeleton width={100} height={14} />
            </View>
          </View>
        ))}
      </Surface>

      {/* Mark as Paid button skeleton */}
      <Skeleton width="100%" height={48} borderRadius={12} />

      {/* Payment History */}
      <Skeleton width={130} height={18} style={{ marginTop: 4 }} />
      <Surface style={[styles.historyCard, { backgroundColor: colors.cardBackground }]} elevation={1}>
        {[1, 2].map((i) => (
          <View key={i}>
            {i > 1 && <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
            <View style={styles.paymentRow}>
              <View>
                <Skeleton width={100} height={14} />
                <Skeleton width={70} height={12} style={{ marginTop: 4 }} />
              </View>
              <Skeleton width={50} height={14} />
            </View>
          </View>
        ))}
      </Surface>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailsCard: {
    borderRadius: 12,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
})
