import { View, StyleSheet } from 'react-native'
import { Text, IconButton, Surface } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'

interface PaymentCardCardProps {
  card: {
    id: string
    cardholderName: string
    lastFourDigits: string
    expiryMonth: number
    expiryYear: number
    cardBrand: string
    nickname: string | null
    color: string
  }
  onEdit?: () => void
  onDelete?: () => void
}

export function PaymentCardCard({ card, onEdit, onDelete }: PaymentCardCardProps) {
  const displayName = card.nickname || `•••• ${card.lastFourDigits}`
  const expiryDisplay = `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}`

  return (
    <Surface elevation={1} style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor: `${card.color}14` }]}>
        <MaterialCommunityIcons
          name="credit-card"
          size={24}
          color={card.color}
        />
      </View>
      <View style={styles.info}>
        <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text variant="bodySmall" style={styles.meta}>
          {card.cardBrand} · {expiryDisplay}
        </Text>
        <Text variant="bodySmall" style={styles.holder} numberOfLines={1}>
          {card.cardholderName}
        </Text>
      </View>
      <IconButton
        icon="pencil-outline"
        size={20}
        iconColor="#6B7280"
        onPress={onEdit}
        style={styles.iconButton}
      />
      <IconButton
        icon="delete-outline"
        size={20}
        iconColor="#EF4444"
        onPress={onDelete}
        style={styles.iconButton}
      />
    </Surface>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontWeight: '600',
    color: '#111827',
  },
  meta: {
    color: '#6B7280',
    marginTop: 2,
  },
  holder: {
    color: '#9CA3AF',
    marginTop: 1,
  },
  iconButton: {
    margin: 0,
  },
})
