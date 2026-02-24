import { Stack } from 'expo-router'

export default function PaymentCardLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#6366F1' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Payment Cards' }} />
    </Stack>
  )
}
