import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import { PaperProvider } from 'react-native-paper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import { lightTheme, darkTheme } from './index'
import type { AppColors } from './index'
import type { UserSettings } from '@extracker/types'

const THEME_STORAGE_KEY = 'extracker_theme_preference'

interface ThemeContextValue {
  colors: AppColors
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightTheme.appColors,
  isDark: false,
})

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme()
  const queryClient = useQueryClient()
  const [cachedPreference, setCachedPreference] = useState<string | null>(null)

  // Read persisted preference on mount for instant cold-start theming
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((value) => {
      if (value) setCachedPreference(value)
    })
  }, [])

  // Read user preference from TanStack Query settings cache
  const settings = queryClient.getQueryData<UserSettings>(['settings'])
  const userPreference = settings?.theme ?? cachedPreference ?? 'system'

  // Persist preference whenever it changes
  useEffect(() => {
    if (settings?.theme) {
      setCachedPreference(settings.theme)
      AsyncStorage.setItem(THEME_STORAGE_KEY, settings.theme)
    }
  }, [settings?.theme])

  // Subscribe to settings cache changes so theme updates instantly
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] === 'settings') {
        const data = queryClient.getQueryData<UserSettings>(['settings'])
        if (data?.theme && data.theme !== cachedPreference) {
          setCachedPreference(data.theme)
        }
      }
    })
    return unsubscribe
  }, [queryClient, cachedPreference])

  // Resolve effective theme
  const isDark = useMemo(() => {
    if (userPreference === 'dark') return true
    if (userPreference === 'light') return false
    return systemScheme === 'dark'
  }, [userPreference, systemScheme])

  const theme = isDark ? darkTheme : lightTheme

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ colors: theme.appColors, isDark }),
    [theme, isDark],
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </ThemeContext.Provider>
  )
}
