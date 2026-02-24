import { View, ActivityIndicator, StyleSheet } from 'react-native'

/**
 * Full-screen centered loading indicator.
 * Used as the default loading state for screens and tab views.
 */
export function ScreenLoading() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
})
