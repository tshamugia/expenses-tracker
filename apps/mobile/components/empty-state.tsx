import { View, StyleSheet } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/lib/theme/theme-context'

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
  const { colors } = useAppTheme()

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={64}
        color={colors.textMuted}
      />
      <Text variant="titleMedium" style={[styles.title, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {description ? (
        <Text variant="bodyMedium" style={[styles.description, { color: colors.textTertiary }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          mode="contained"
          onPress={onAction}
          style={styles.button}
          buttonColor={colors.brandPrimary}
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
  },
  description: {
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
  },
})
