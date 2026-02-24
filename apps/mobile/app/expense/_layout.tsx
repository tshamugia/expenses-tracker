import { Stack } from 'expo-router'
import { useAppTheme } from '@/lib/theme/theme-context'

/**
 * Stack navigator layout for all expense-related routes:
 *   /expense/create    - New expense form
 *   /expense/[id]      - Expense detail view
 *   /expense/[id]/edit - Edit expense form
 *
 * Uses the app's header background color from theme to
 * maintain visual consistency with the tab navigator.
 */
export default function ExpenseLayout() {
  const { colors } = useAppTheme()

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
        animation: 'slide_from_right',
      }}
    />
  )
}
