import { View, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useAppTheme } from '@/lib/theme/theme-context'

interface CategoryChipProps {
  name: string
  color?: string
}

/**
 * Compact chip showing a category name with a leading color dot.
 * Used within expense cards and filter displays.
 */
export function CategoryChip({ name, color = '#6366F1' }: CategoryChipProps) {
  const { colors } = useAppTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.chipBackground }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="bodySmall" style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  label: {
    lineHeight: 16,
  },
})
