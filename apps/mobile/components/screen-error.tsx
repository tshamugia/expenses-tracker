import { View, StyleSheet } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'

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
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={48}
        color="#EF4444"
      />
      <Text variant="titleLarge" style={styles.title}>
        Something went wrong
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      {onRetry && (
        <Button
          mode="contained"
          onPress={onRetry}
          style={styles.button}
          buttonColor="#6366F1"
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
    backgroundColor: '#ffffff',
  },
  title: {
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
    color: '#111827',
  },
  message: {
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
