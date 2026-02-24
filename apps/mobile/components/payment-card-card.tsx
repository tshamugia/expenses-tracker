import { View, StyleSheet } from 'react-native'
import { Text, IconButton, Surface } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/lib/theme/theme-context'

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
  const { colors } = useAppTheme()
  const displayName = card.nickname || `\u2022\u2022\u2022\u2022 ${card.lastFourDigits}`
  const expiryDisplay = `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}`

  return (
    <Surface elevation={1} style={[styles.card, { backgroundColor: colors.cardBackground }]}>
      <View style={[styles.iconContainer, { backgroundColor: `${card.color}14` }]}>
        <MaterialCommunityIcons
          name="credit-card"
          size={24}
          color={card.color}
        />
      </View>
      <View style={styles.info}>
        <Text variant="bodyLarge" style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
        <Text variant="bodySmall" style={[styles.meta, { color: colors.textTertiary }]}>
          {card.cardBrand} · {expiryDisplay}
        </Text>
        <Text variant="bodySmall" style={[styles.holder, { color: colors.textMuted }]} numberOfLines={1}>
          {card.cardholderName}
        </Text>
      </View>
      <IconButton
        icon="pencil-outline"
        size={20}
        iconColor={colors.textTertiary}
        onPress={onEdit}
        style={styles.iconButton}
      />
      <IconButton
        icon="delete-outline"
        size={20}
        iconColor={colors.error}
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
  },
  meta: {
    marginTop: 2,
  },
  holder: {
    marginTop: 1,
  },
  iconButton: {
    margin: 0,
  },
})
