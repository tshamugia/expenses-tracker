import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAppTheme } from '@/lib/theme/theme-context'

/**
 * Full-screen centered loading indicator.
 * Used as the default loading state for screens and tab views.
 */
export function ScreenLoading() {
  const { colors } = useAppTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.screenBackground }]}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
