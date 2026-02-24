import { Stack } from 'expo-router'

export default function CategoryLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#6366F1' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Categories' }} />
    </Stack>
  )
}
