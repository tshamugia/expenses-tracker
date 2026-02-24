import { StyleSheet } from 'react-native'
import { SegmentedButtons } from 'react-native-paper'

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
  return (
    <SegmentedButtons
      value={value}
      onValueChange={onChange}
      buttons={CURRENCIES.map((c) => ({
        value: c.value,
        label: c.label,
        style: [
          styles.button,
          value === c.value ? styles.buttonChecked : styles.buttonUnchecked,
        ],
        labelStyle: value === c.value ? styles.labelChecked : styles.labelUnchecked,
        checkedColor: '#ffffff',
        uncheckedColor: '#6B7280',
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
    borderColor: '#D1D5DB',
  },
  buttonChecked: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  buttonUnchecked: {
    backgroundColor: '#ffffff',
  },
  labelChecked: {
    color: '#ffffff',
    fontWeight: '600',
  },
  labelUnchecked: {
    color: '#6B7280',
    fontWeight: '500',
  },
})
