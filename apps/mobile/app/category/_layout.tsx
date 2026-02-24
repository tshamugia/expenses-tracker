import { Stack } from 'expo-router'
import { useAppTheme } from '@/lib/theme/theme-context'

export default function CategoryLayout() {
  const { colors } = useAppTheme()

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Categories' }} />
    </Stack>
  )
}
