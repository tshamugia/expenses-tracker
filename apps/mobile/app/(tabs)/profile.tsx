import { View, ScrollView, StyleSheet } from 'react-native'
import { Text, Button, Surface, TouchableRipple } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/lib/stores/auth-store'

interface MenuItemProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
  onPress: () => void
}

function ProfileMenuItem({ icon, label, onPress }: MenuItemProps) {
  return (
    <TouchableRipple
      onPress={onPress}
      rippleColor="rgba(99, 102, 241, 0.08)"
    >
      <View style={styles.menuItem}>
        <MaterialCommunityIcons name={icon} size={22} color="#6B7280" />
        <Text variant="bodyLarge" style={styles.menuLabel}>
          {label}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={22} color="#9CA3AF" />
      </View>
    </TouchableRipple>
  )
}

export default function ProfileScreen() {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const initials = (user?.name || user?.email || '?')
    .charAt(0)
    .toUpperCase()

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + User Info */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text variant="headlineLarge" style={styles.avatarText}>
            {initials}
          </Text>
        </View>
        <Text variant="titleLarge" style={styles.userName}>
          {user?.name || 'User'}
        </Text>
        <Text variant="bodyMedium" style={styles.userEmail}>
          {user?.email}
        </Text>
      </View>

      {/* Manage Section */}
      <Surface elevation={1} style={styles.section}>
        <Text variant="labelLarge" style={styles.sectionTitle}>
          Manage
        </Text>
        <ProfileMenuItem
          icon="shape"
          label="Categories"
          onPress={() => router.push('/category')}
        />
        <ProfileMenuItem
          icon="credit-card"
          label="Payment Cards"
          onPress={() => router.push('/payment-card')}
        />
      </Surface>

      {/* Account Section */}
      <Surface elevation={1} style={styles.section}>
        <Text variant="labelLarge" style={styles.sectionTitle}>
          Account
        </Text>
        <ProfileMenuItem
          icon="lock-reset"
          label="Change Password"
          onPress={() => router.push('/change-password')}
        />
        <ProfileMenuItem
          icon="cog"
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      </Surface>

      {/* Log Out */}
      <Button
        mode="outlined"
        onPress={logout}
        style={styles.logoutButton}
        textColor="#EF4444"
        contentStyle={styles.logoutContent}
      >
        Log Out
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  userName: {
    fontWeight: '600',
    color: '#111827',
  },
  userEmail: {
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#9CA3AF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLabel: {
    flex: 1,
    marginLeft: 12,
    color: '#374151',
  },
  logoutButton: {
    marginTop: 8,
    borderColor: '#EF4444',
    borderRadius: 12,
  },
  logoutContent: {
    height: 48,
  },
})
