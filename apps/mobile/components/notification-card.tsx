import { View, StyleSheet } from 'react-native'
import { Text, IconButton, Surface, TouchableRipple } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { formatRelativeDate } from '@extracker/core'
import { useAppTheme } from '@/lib/theme/theme-context'

interface NotificationItem {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  actionUrl: string | null
  createdAt: string
}

interface NotificationCardProps {
  notification: NotificationItem
  onPress?: () => void
  onDelete?: () => void
}

const TYPE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  info: 'information',
  success: 'check-circle',
  warning: 'alert',
  error: 'alert-circle',
  payment: 'cash',
  expense: 'receipt',
}

const TYPE_COLORS: Record<string, string> = {
  info: '#3B82F6',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  payment: '#6366F1',
  expense: '#8B5CF6',
}

export function NotificationCard({
  notification,
  onPress,
  onDelete,
}: NotificationCardProps) {
  const { colors } = useAppTheme()
  const iconName = TYPE_ICONS[notification.type] || 'bell'
  const iconColor = TYPE_COLORS[notification.type] || '#6366F1'
  const isUnread = !notification.isRead

  return (
    <TouchableRipple
      onPress={onPress}
      rippleColor="rgba(99, 102, 241, 0.08)"
      style={styles.ripple}
    >
      <Surface
        elevation={1}
        style={[
          styles.card,
          { backgroundColor: colors.cardBackground },
          isUnread && { borderLeftWidth: 4, borderLeftColor: colors.brandPrimary },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}14` }]}>
          <MaterialCommunityIcons
            name={iconName}
            size={22}
            color={iconColor}
          />
        </View>
        <View style={styles.content}>
          <Text
            variant="bodyMedium"
            style={[
              { color: colors.textSecondary },
              isUnread && { fontWeight: '700', color: colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          <Text
            variant="bodySmall"
            style={[styles.message, { color: colors.textTertiary }]}
            numberOfLines={2}
          >
            {notification.message}
          </Text>
          <Text variant="labelSmall" style={{ color: colors.textMuted, marginTop: 4 }}>
            {formatRelativeDate(new Date(notification.createdAt))}
          </Text>
        </View>
        <IconButton
          icon="delete-outline"
          size={20}
          iconColor={colors.textMuted}
          onPress={onDelete}
          style={styles.deleteButton}
        />
      </Surface>
    </TouchableRipple>
  )
}

const styles = StyleSheet.create({
  ripple: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    marginRight: 4,
  },
  message: {
    marginTop: 2,
    lineHeight: 18,
  },
  deleteButton: {
    margin: 0,
  },
})
