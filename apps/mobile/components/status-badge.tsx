import { StyleSheet } from 'react-native'
import { Chip } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/lib/theme/theme-context'

interface StatusBadgeProps {
  isPaid: boolean
  isOverdue: boolean
}

interface StatusConfig {
  label: string
  icon: string
  backgroundColor: string
  textColor: string
}

/**
 * Compact status chip indicating Paid, Overdue, or Pending state.
 * Evaluates paid status first; an expense cannot be both paid and overdue.
 */
export function StatusBadge({ isPaid, isOverdue }: StatusBadgeProps) {
  const { colors } = useAppTheme()

  const config: StatusConfig = isPaid
    ? {
        label: 'Paid',
        icon: 'check-circle',
        backgroundColor: `${colors.success}1A`,
        textColor: colors.success,
      }
    : isOverdue
      ? {
          label: 'Overdue',
          icon: 'alert-circle',
          backgroundColor: `${colors.error}1A`,
          textColor: colors.error,
        }
      : {
          label: 'Pending',
          icon: 'clock-outline',
          backgroundColor: `${colors.warning}1A`,
          textColor: colors.warning,
        }

  return (
    <Chip
      mode="flat"
      compact
      style={[styles.chip, { backgroundColor: config.backgroundColor }]}
      textStyle={[styles.text, { color: config.textColor }]}
      icon={() => (
        <MaterialCommunityIcons
          name={config.icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={14}
          color={config.textColor}
        />
      )}
    >
      {config.label}
    </Chip>
  )
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 8,
    height: 28,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
})
