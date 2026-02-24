import { StyleSheet } from 'react-native'
import { SegmentedButtons } from 'react-native-paper'
import { useAppTheme } from '@/lib/theme/theme-context'

const CURRENCIES = [
  { value: 'GEL', label: 'GEL' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
] as const

interface CurrencyPickerProps {
  value: string
  onChange: (currency: string) => void
}

/**
 * Three-way segmented button for selecting a currency (GEL, USD, EUR).
 * Built on React Native Paper's SegmentedButtons with the app's
 * indigo primary color for the checked state.
 */
export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  const { colors } = useAppTheme()

  return (
    <SegmentedButtons
      value={value}
      onValueChange={onChange}
      buttons={CURRENCIES.map((c) => ({
        value: c.value,
        label: c.label,
        style: [
          styles.button,
          { borderColor: colors.inputBorder },
          value === c.value
            ? { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }
            : { backgroundColor: colors.inputBackground },
        ],
        labelStyle: value === c.value
          ? styles.labelChecked
          : [styles.labelUnchecked, { color: colors.textTertiary }],
        checkedColor: '#ffffff',
        uncheckedColor: colors.textTertiary,
      }))}
      style={styles.container}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
  },
  button: {
    borderRadius: 12,
  },
  labelChecked: {
    color: '#ffffff',
    fontWeight: '600',
  },
  labelUnchecked: {
    fontWeight: '500',
  },
})
