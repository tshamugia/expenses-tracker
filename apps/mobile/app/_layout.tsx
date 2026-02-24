import { useEffect, useRef } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { Slot, useRouter, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { PaperProvider, Portal, Snackbar, MD3LightTheme } from 'react-native-paper'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '@/lib/stores/auth-store'
import { createQueryClient } from '@/lib/api/query-client'
import { useSnackbar } from '@/lib/hooks/use-snackbar'

const queryClient = createQueryClient()

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6366F1',
    secondary: '#8B5CF6',
  },
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, initialize } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()
  const initialized = useRef(false)

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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    )
  }

  return <>{children}</>
}

const SNACKBAR_COLORS: Record<string, string> = {
  success: '#16A34A',
  error: '#DC2626',
  info: '#6366F1',
}

function GlobalSnackbar() {
  const { visible, message, type, hideSnackbar } = useSnackbar()

  return (
    <Snackbar
      visible={visible}
      onDismiss={hideSnackbar}
      duration={3000}
      style={{ backgroundColor: SNACKBAR_COLORS[type] || SNACKBAR_COLORS.info }}
      action={{ label: 'OK', textColor: '#ffffff', onPress: hideSnackbar }}
    >
      {message}
    </Snackbar>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <AuthGuard>
          <Portal.Host>
            <Slot />
            <GlobalSnackbar />
          </Portal.Host>
        </AuthGuard>
      </PaperProvider>
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
})
