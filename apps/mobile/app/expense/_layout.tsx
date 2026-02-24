import { Stack } from 'expo-router'

/**
 * Stack navigator layout for all expense-related routes:
 *   /expense/create    - New expense form
 *   /expense/[id]      - Expense detail view
 *   /expense/[id]/edit - Edit expense form
 *
 * Uses the app's primary indigo (#6366F1) header style to
 * maintain visual consistency with the tab navigator.
 */
export default function ExpenseLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#6366F1' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    />
  )
}
