import { View, StyleSheet } from 'react-native'
import { Text, Surface } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/lib/theme/theme-context'

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  color: string
}

/**
 * Dashboard statistic card designed for a 2-column grid layout.
 * The caller is responsible for wrapping cards in a row with `gap`.
 *
 * Usage:
 *   <View style={{ flexDirection: 'row', gap: 12 }}>
 *     <StatCard icon="cash" label="Total" value="$1,250" color="#6366F1" />
 *     <StatCard icon="check-circle" label="Paid" value="$800" color="#22C55E" />
 *   </View>
 */
export function StatCard({ icon, label, value, color }: StatCardProps) {
  const { colors } = useAppTheme()

  return (
    <Surface style={[styles.surface, { backgroundColor: colors.cardBackground }]} elevation={1}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}1A` }]}>
        <MaterialCommunityIcons
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={28}
          color={color}
        />
      </View>
      <Text variant="bodySmall" style={[styles.label, { color: colors.textTertiary }]}>
        {label}
      </Text>
      <Text variant="headlineSmall" style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </Surface>
  )
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    marginBottom: 4,
  },
  value: {
    fontWeight: '700',
  },
})
