import { StyleSheet } from 'react-native'
import { Chip } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'

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

function getStatusConfig(isPaid: boolean, isOverdue: boolean): StatusConfig {
  if (isPaid) {
    return {
      label: 'Paid',
      icon: 'check-circle',
      backgroundColor: '#DCFCE7',
      textColor: '#166534',
    }
  }
  if (isOverdue) {
    return {
      label: 'Overdue',
      icon: 'alert-circle',
      backgroundColor: '#FEE2E2',
      textColor: '#991B1B',
    }
  }
  return {
    label: 'Pending',
    icon: 'clock-outline',
    backgroundColor: '#FEF3C7',
    textColor: '#92400E',
  }
}

/**
 * Compact status chip indicating Paid, Overdue, or Pending state.
 * Evaluates paid status first; an expense cannot be both paid and overdue.
 */
export function StatusBadge({ isPaid, isOverdue }: StatusBadgeProps) {
  const config = getStatusConfig(isPaid, isOverdue)

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
