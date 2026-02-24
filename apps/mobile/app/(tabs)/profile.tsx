import { View, ScrollView, StyleSheet } from 'react-native'
import { Text, Button, Surface, TouchableRipple } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppTheme } from '@/lib/theme/theme-context'

interface MenuItemProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
  onPress: () => void
}

function ProfileMenuItem({ icon, label, onPress }: MenuItemProps) {
  const { colors } = useAppTheme()

  return (
    <TouchableRipple
      onPress={onPress}
      rippleColor="rgba(99, 102, 241, 0.08)"
    >
      <View style={styles.menuItem}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.textTertiary} />
        <Text variant="bodyLarge" style={[styles.menuLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
      </View>
    </TouchableRipple>
  )
}

export default function ProfileScreen() {
  const router = useRouter()
  const { colors } = useAppTheme()
  const { user, logout } = useAuthStore()

  const initials = (user?.name || user?.email || '?')
    .charAt(0)
    .toUpperCase()

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.screenBackgroundSecondary }]}
      contentContainerStyle={styles.content}
    >
      {/* Avatar + User Info */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.brandPrimary }]}>
          <Text variant="headlineLarge" style={styles.avatarText}>
            {initials}
          </Text>
        </View>
        <Text variant="titleLarge" style={[styles.userName, { color: colors.textPrimary }]}>
          {user?.name || 'User'}
        </Text>
        <Text variant="bodyMedium" style={[styles.userEmail, { color: colors.textTertiary }]}>
          {user?.email}
        </Text>
      </View>

      {/* Manage Section */}
      <Surface elevation={1} style={[styles.section, { backgroundColor: colors.cardBackground }]}>
        <Text variant="labelLarge" style={[styles.sectionTitle, { color: colors.textMuted }]}>
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
      <Surface elevation={1} style={[styles.section, { backgroundColor: colors.cardBackground }]}>
        <Text variant="labelLarge" style={[styles.sectionTitle, { color: colors.textMuted }]}>
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
        style={[styles.logoutButton, { borderColor: colors.error }]}
        textColor={colors.error}
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
  },
  userEmail: {
    marginTop: 4,
  },
  section: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
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
  },
  logoutButton: {
    marginTop: 8,
    borderRadius: 12,
  },
  logoutContent: {
    height: 48,
  },
})
