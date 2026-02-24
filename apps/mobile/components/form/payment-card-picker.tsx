import { useState, useCallback, useMemo } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { TextInput, Menu, Text, ActivityIndicator } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { usePaymentCards } from '@/lib/hooks/use-payment-cards'
import { useAppTheme } from '@/lib/theme/theme-context'

interface PaymentCardPickerProps {
  value: string | null
  onChange: (cardId: string | null) => void
}

/**
 * Dropdown picker for payment cards.
 *
 * Fetches cards via `usePaymentCards()` and renders a Paper Menu
 * anchored to a read-only TextInput. Each item displays the card's
 * nickname or masked last-four digits. A "No Card" option clears
 * the selection.
 */
export function PaymentCardPicker({ value, onChange }: PaymentCardPickerProps) {
  const { colors } = useAppTheme()
  const [menuVisible, setMenuVisible] = useState(false)
  const { data, isLoading } = usePaymentCards()

  const cards = useMemo(() => data?.data ?? [], [data])

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === value),
    [cards, value],
  )

  const getCardDisplayText = useCallback(
    (card: { nickname: string | null; lastFourDigits: string }) => {
      return card.nickname || `\u2022\u2022\u2022\u2022 ${card.lastFourDigits}`
    },
    [],
  )

  const displayText = selectedCard ? getCardDisplayText(selectedCard) : ''
  const placeholder = isLoading ? 'Loading cards...' : 'Select payment card'

  const openMenu = useCallback(() => {
    if (!isLoading) setMenuVisible(true)
  }, [isLoading])

  const closeMenu = useCallback(() => setMenuVisible(false), [])

  const handleSelect = useCallback(
    (cardId: string | null) => {
      onChange(cardId)
      closeMenu()
    },
    [onChange, closeMenu],
  )

  return (
    <View>
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchor={
          <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Select payment card">
            <View pointerEvents="none">
              <TextInput
                label="Payment Card"
                mode="outlined"
                value={displayText}
                placeholder={placeholder}
                editable={false}
                outlineColor={colors.inputBorder}
                activeOutlineColor={colors.brandPrimary}
                outlineStyle={styles.outline}
                style={{ backgroundColor: colors.inputBackground }}
                textColor={colors.textPrimary}
                left={
                  selectedCard ? (
                    <TextInput.Icon
                      icon="credit-card-outline"
                      color={selectedCard.color || colors.textTertiary}
                    />
                  ) : undefined
                }
                right={
                  isLoading ? (
                    <TextInput.Icon icon={() => <ActivityIndicator size={18} color={colors.brandPrimary} />} />
                  ) : (
                    <TextInput.Icon
                      icon={menuVisible ? 'chevron-up' : 'chevron-down'}
                      color={colors.textTertiary}
                    />
                  )
                }
              />
            </View>
          </Pressable>
        }
        contentStyle={[styles.menuContent, { backgroundColor: colors.cardBackground }]}
        style={styles.menu}
      >
        <Menu.Item
          onPress={() => handleSelect(null)}
          title="No Card"
          leadingIcon={() => (
            <MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.textMuted} />
          )}
          titleStyle={{ color: colors.textMuted }}
        />

        {cards.map((card) => (
          <Menu.Item
            key={card.id}
            onPress={() => handleSelect(card.id)}
            title={`${getCardDisplayText(card)} · ${card.cardBrand}`}
            leadingIcon={() => (
              <MaterialCommunityIcons
                name="credit-card-outline"
                size={20}
                color={card.color || colors.textTertiary}
              />
            )}
            titleStyle={[
              { color: colors.textSecondary },
              value === card.id && { color: colors.brandPrimary, fontWeight: '600' },
            ]}
          />
        ))}

        {cards.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text variant="bodySmall" style={{ color: colors.textMuted }}>
              No payment cards found
            </Text>
          </View>
        )}
      </Menu>
    </View>
  )
}

const styles = StyleSheet.create({
  outline: {
    borderRadius: 12,
  },
  menu: {
    marginTop: 4,
  },
  menuContent: {
    borderRadius: 12,
  },
  emptyContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
})
