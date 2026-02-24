import { View, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { PaymentCardInfo } from '@extracker/types'
import { useAppTheme } from '@/lib/theme/theme-context'

interface PaymentCardChipProps {
  paymentCard: PaymentCardInfo
}

/**
 * Compact chip displaying a payment card's brand icon and
 * either its nickname or masked last four digits.
 */
export function PaymentCardChip({ paymentCard }: PaymentCardChipProps) {
  const { colors } = useAppTheme()
  const displayText = paymentCard.nickname
    ? paymentCard.nickname
    : `\u2022\u2022\u2022\u2022 ${paymentCard.lastFourDigits}`

  return (
    <View style={[styles.container, { backgroundColor: colors.chipBackground }]}>
      <MaterialCommunityIcons
        name="credit-card-outline"
        size={14}
        color={colors.textMuted}
      />
      <Text variant="bodySmall" style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {displayText}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    alignSelf: 'flex-start',
  },
  label: {
    lineHeight: 16,
  },
})
