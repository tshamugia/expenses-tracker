import { View, StyleSheet } from 'react-native'
import { Text, IconButton, Surface } from 'react-native-paper'

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
  return (
    <Surface elevation={1} style={styles.card}>
      <View
        style={[styles.colorDot, { backgroundColor: category.color }]}
      />
      <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
        {category.categoryName}
      </Text>
      <IconButton
        icon="pencil-outline"
        size={20}
        iconColor="#6B7280"
        onPress={onEdit}
        style={styles.iconButton}
      />
      <IconButton
        icon="delete-outline"
        size={20}
        iconColor="#EF4444"
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
    backgroundColor: '#ffffff',
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
    color: '#111827',
  },
  iconButton: {
    margin: 0,
  },
})
