import { View, StyleSheet } from 'react-native'
import { Skeleton } from '../skeleton'
import { useAppTheme } from '@/lib/theme/theme-context'

export function NotificationListSkeleton() {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackgroundSecondary }]}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
          <View style={styles.cardRow}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={styles.cardContent}>
              <Skeleton width={160} height={14} />
              <Skeleton width="90%" height={12} style={{ marginTop: 6 }} />
              <Skeleton width={80} height={10} style={{ marginTop: 8 }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 12,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardContent: {
    flex: 1,
  },
})
