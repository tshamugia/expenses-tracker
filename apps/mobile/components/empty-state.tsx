import { View, StyleSheet } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'

interface EmptyStateProps {
  icon: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * Reusable empty state placeholder with icon, title, description,
 * and an optional call-to-action button.
 *
 * Usage:
 *   <EmptyState
 *     icon="cash-remove"
 *     title="No expenses yet"
 *     description="Add your first expense to start tracking."
 *     actionLabel="Add Expense"
 *     onAction={() => router.push('/add-expense')}
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={64}
        color="#9CA3AF"
      />
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="bodyMedium" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          mode="contained"
          onPress={onAction}
          style={styles.button}
          buttonColor="#6366F1"
        >
          {actionLabel}
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  title: {
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
    color: '#374151',
  },
  description: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6B7280',
    lineHeight: 22,
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
  },
})
