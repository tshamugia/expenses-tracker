import { useEffect, useRef } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { Slot, useRouter, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Portal, Snackbar } from 'react-native-paper'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '@/lib/stores/auth-store'
import { createQueryClient } from '@/lib/api/query-client'
import { useSnackbar } from '@/lib/hooks/use-snackbar'
import { ErrorBoundary } from '@/components/error-boundary'
import { ThemeProvider, useAppTheme } from '@/lib/theme/theme-context'

const queryClient = createQueryClient()

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, initialize } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()
  const initialized = useRef(false)
  const { colors } = useAppTheme()

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      initialize()
    }
  }, [initialize])

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [isAuthenticated, isLoading, segments, router])

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.screenBackground }]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    )
  }

  return <>{children}</>
}

function GlobalSnackbar() {
  const { visible, message, type, hideSnackbar } = useSnackbar()
  const { colors } = useAppTheme()

  const snackbarColors: Record<string, string> = {
    success: colors.success,
    error: colors.error,
    info: colors.brandPrimary,
  }

  return (
    <Snackbar
      visible={visible}
      onDismiss={hideSnackbar}
      duration={3000}
      style={{ backgroundColor: snackbarColors[type] || snackbarColors.info }}
      action={{ label: 'OK', textColor: '#ffffff', onPress: hideSnackbar }}
    >
      {message}
    </Snackbar>
  )
}

function ThemedStatusBar() {
  const { isDark } = useAppTheme()
  return <StatusBar style={isDark ? 'light' : 'dark'} />
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedStatusBar />
        <AuthGuard>
          <Portal.Host>
            <ErrorBoundary>
              <Slot />
              <GlobalSnackbar />
            </ErrorBoundary>
          </Portal.Host>
        </AuthGuard>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
