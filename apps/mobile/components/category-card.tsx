import { View, StyleSheet } from 'react-native'
import { Text, IconButton, Surface } from 'react-native-paper'
import { useAppTheme } from '@/lib/theme/theme-context'

interface CategoryCardProps {
  category: {
    id: string
    categoryName: string
    color: string
  }
  onEdit?: () => void
  onDelete?: () => void
}

export function CategoryCard({ category, onEdit, onDelete }: CategoryCardProps) {
  const { colors } = useAppTheme()

  return (
    <Surface elevation={1} style={[styles.card, { backgroundColor: colors.cardBackground }]}>
      <View
        style={[styles.colorDot, { backgroundColor: category.color }]}
      />
      <Text variant="bodyLarge" style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {category.categoryName}
      </Text>
      <IconButton
        icon="pencil-outline"
        size={20}
        iconColor={colors.textTertiary}
        onPress={onEdit}
        style={styles.iconButton}
      />
      <IconButton
        icon="delete-outline"
        size={20}
        iconColor={colors.error}
        onPress={onDelete}
        style={styles.iconButton}
      />
    </Surface>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  name: {
    flex: 1,
    marginLeft: 12,
    fontWeight: '500',
  },
  iconButton: {
    margin: 0,
  },
})
