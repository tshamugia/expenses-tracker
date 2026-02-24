import { useState, useCallback, useMemo } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { TextInput, Menu, Text, ActivityIndicator } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { usePaymentCards } from '@/lib/hooks/use-payment-cards'

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
                outlineColor="#D1D5DB"
                activeOutlineColor="#6366F1"
                outlineStyle={styles.outline}
                left={
                  selectedCard ? (
                    <TextInput.Icon
                      icon="credit-card-outline"
                      color={selectedCard.color || '#6B7280'}
                    />
                  ) : undefined
                }
                right={
                  isLoading ? (
                    <TextInput.Icon icon={() => <ActivityIndicator size={18} color="#6366F1" />} />
                  ) : (
                    <TextInput.Icon
                      icon={menuVisible ? 'chevron-up' : 'chevron-down'}
                      color="#6B7280"
                    />
                  )
                }
              />
            </View>
          </Pressable>
        }
        contentStyle={styles.menuContent}
        style={styles.menu}
      >
        <Menu.Item
          onPress={() => handleSelect(null)}
          title="No Card"
          leadingIcon={() => (
            <MaterialCommunityIcons name="close-circle-outline" size={18} color="#9CA3AF" />
          )}
          titleStyle={styles.noCardTitle}
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
                color={card.color || '#6B7280'}
              />
            )}
            titleStyle={[
              styles.menuItemTitle,
              value === card.id && styles.menuItemTitleSelected,
            ]}
          />
        ))}

        {cards.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text variant="bodySmall" style={styles.emptyText}>
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  noCardTitle: {
    color: '#9CA3AF',
  },
  menuItemTitle: {
    color: '#374151',
  },
  menuItemTitleSelected: {
    color: '#6366F1',
    fontWeight: '600',
  },
  emptyContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
  },
})
