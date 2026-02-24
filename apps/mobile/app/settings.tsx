import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { Text, Surface, Switch, TextInput, Chip } from 'react-native-paper'
import { Stack } from 'expo-router'
import { ScreenLoading, ScreenError } from '@/components'
import { useSettings, useUpdateSettings, useSnackbar } from '@/lib/hooks'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Theme, Currency } from '@extracker/types'

const THEMES: { label: string; value: Theme }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
]

const CURRENCIES: { label: string; value: Currency }[] = [
  { label: 'GEL', value: 'GEL' },
  { label: 'USD', value: 'USD' },
  { label: 'EUR', value: 'EUR' },
]

export default function SettingsScreen() {
  const { showSnackbar } = useSnackbar()
  const { data: settings, isLoading, isError, error, refetch } = useSettings()
  const updateSettings = useUpdateSettings()

  const handleUpdate = (patch: Record<string, unknown>) => {
    updateSettings.mutate(patch as Parameters<typeof updateSettings.mutate>[0], {
      onError: (err) => showSnackbar(getApiErrorMessage(err), 'error'),
    })
  }

  if (isLoading) return <ScreenLoading />
  if (isError) {
    return (
      <ScreenError
        message={getApiErrorMessage(error)}
        onRetry={refetch}
      />
    )
  }

  if (!settings) return null

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: '#6366F1' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            colors={['#6366F1']}
          />
        }
      >
        {/* Appearance */}
        <Surface elevation={1} style={styles.section}>
          <Text variant="labelLarge" style={styles.sectionTitle}>
            Appearance
          </Text>
          <View style={styles.chipRow}>
            {THEMES.map((t) => (
              <Chip
                key={t.value}
                selected={settings.theme === t.value}
                onPress={() => handleUpdate({ theme: t.value })}
                style={[
                  styles.chip,
                  settings.theme === t.value && styles.chipSelected,
                ]}
                textStyle={
                  settings.theme === t.value
                    ? styles.chipTextSelected
                    : styles.chipText
                }
                showSelectedOverlay={false}
              >
                {t.label}
              </Chip>
            ))}
          </View>
        </Surface>

        {/* Currency */}
        <Surface elevation={1} style={styles.section}>
          <Text variant="labelLarge" style={styles.sectionTitle}>
            Default Currency
          </Text>
          <View style={styles.chipRow}>
            {CURRENCIES.map((c) => (
              <Chip
                key={c.value}
                selected={settings.defaultCurrency === c.value}
                onPress={() => handleUpdate({ defaultCurrency: c.value })}
                style={[
                  styles.chip,
                  settings.defaultCurrency === c.value && styles.chipSelected,
                ]}
                textStyle={
                  settings.defaultCurrency === c.value
                    ? styles.chipTextSelected
                    : styles.chipText
                }
                showSelectedOverlay={false}
              >
                {c.label}
              </Chip>
            ))}
          </View>
        </Surface>

        {/* Notifications */}
        <Surface elevation={1} style={styles.section}>
          <Text variant="labelLarge" style={styles.sectionTitle}>
            Notifications
          </Text>
          <View style={styles.switchRow}>
            <Text variant="bodyLarge" style={styles.switchLabel}>
              Email Notifications
            </Text>
            <Switch
              value={settings.emailEnabled}
              onValueChange={(val) => handleUpdate({ emailEnabled: val })}
              color="#6366F1"
            />
          </View>
          <View style={styles.switchRow}>
            <Text variant="bodyLarge" style={styles.switchLabel}>
              SMS Notifications
            </Text>
            <Switch
              value={settings.smsEnabled}
              onValueChange={(val) => handleUpdate({ smsEnabled: val })}
              color="#6366F1"
            />
          </View>
          <View style={styles.switchRow}>
            <Text variant="bodyLarge" style={styles.switchLabel}>
              Push Notifications
            </Text>
            <Switch
              value={settings.pushEnabled}
              onValueChange={(val) => handleUpdate({ pushEnabled: val })}
              color="#6366F1"
            />
          </View>
          <View style={styles.daysRow}>
            <Text variant="bodyLarge" style={styles.switchLabel}>
              Notify before (days)
            </Text>
            <TextInput
              value={String(settings.notifyBeforeDays)}
              onChangeText={(text) => {
                const num = parseInt(text, 10)
                if (!isNaN(num) && num >= 1 && num <= 30) {
                  handleUpdate({ notifyBeforeDays: num })
                }
              }}
              mode="outlined"
              keyboardType="numeric"
              maxLength={2}
              style={styles.daysInput}
              outlineStyle={styles.daysOutline}
              dense
            />
          </View>
        </Surface>

        {/* Subscription */}
        <Surface elevation={1} style={styles.section}>
          <Text variant="labelLarge" style={styles.sectionTitle}>
            Subscription
          </Text>
          <View style={styles.infoRow}>
            <Text variant="bodyMedium" style={styles.infoLabel}>
              Plan
            </Text>
            <Text variant="bodyMedium" style={styles.infoValue}>
              {settings.subscriptionPlan.charAt(0).toUpperCase() +
                settings.subscriptionPlan.slice(1)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text variant="bodyMedium" style={styles.infoLabel}>
              Status
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.infoValue,
                settings.subscriptionStatus === 'active'
                  ? styles.statusActive
                  : styles.statusInactive,
              ]}
            >
              {settings.subscriptionStatus.charAt(0).toUpperCase() +
                settings.subscriptionStatus.slice(1)}
            </Text>
          </View>
        </Surface>
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  section: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 16,
    padding: 16,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: '#F3F4F6',
  },
  chipSelected: {
    backgroundColor: '#6366F1',
  },
  chipText: {
    color: '#374151',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: {
    color: '#374151',
    flex: 1,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  daysInput: {
    width: 64,
    backgroundColor: '#ffffff',
    textAlign: 'center',
  },
  daysOutline: {
    borderRadius: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    color: '#6B7280',
  },
  infoValue: {
    color: '#111827',
    fontWeight: '500',
  },
  statusActive: {
    color: '#16A34A',
  },
  statusInactive: {
    color: '#DC2626',
  },
})
