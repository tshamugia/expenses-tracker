import { View, StyleSheet } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/lib/theme/theme-context'

interface ScreenErrorProps {
  message?: string
  onRetry?: () => void
}

/**
 * Full-screen error state with icon, message, and optional retry action.
 * Used when a screen-level data fetch or operation fails.
 */
export function ScreenError({
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
}: ScreenErrorProps) {
  const { colors } = useAppTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackground }]}>
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={48}
        color={colors.error}
      />
      <Text variant="titleLarge" style={[styles.title, { color: colors.textPrimary }]}>
        Something went wrong
      </Text>
      <Text variant="bodyMedium" style={[styles.message, { color: colors.textTertiary }]}>
        {message}
      </Text>
      {onRetry && (
        <Button
          mode="contained"
          onPress={onRetry}
          style={styles.button}
          buttonColor={colors.brandPrimary}
        >
          Try Again
        </Button>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
  },
})
