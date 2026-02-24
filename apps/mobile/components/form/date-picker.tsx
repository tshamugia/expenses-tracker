import { useState, useCallback } from 'react'
import { View, StyleSheet, Platform, Pressable, Modal } from 'react-native'
import { TextInput, Button, Surface, Text } from 'react-native-paper'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useAppTheme } from '@/lib/theme/theme-context'

interface DatePickerProps {
  value: Date | null
  onChange: (date: Date | null) => void
  label?: string
  minimumDate?: Date
}

/**
 * Date input that opens the platform-native date picker.
 *
 * On Android the picker appears as a dialog and auto-dismisses on
 * selection. On iOS it renders inside a bottom modal with a "Done"
 * button so users can scroll through the spinner before confirming.
 */
export function DatePicker({
  value,
  onChange,
  label = 'Date',
  minimumDate,
}: DatePickerProps) {
  const { colors } = useAppTheme()
  const [showPicker, setShowPicker] = useState(false)
  // Hold a temporary date on iOS so the user can scroll before confirming
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date())

  const formatDate = useCallback((date: Date | null): string => {
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [])

  const openPicker = useCallback(() => {
    setTempDate(value ?? new Date())
    setShowPicker(true)
  }, [value])

  const handleAndroidChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      // Android auto-dismisses after any user action
      setShowPicker(false)
      if (event.type === 'set' && selectedDate) {
        onChange(selectedDate)
      }
    },
    [onChange],
  )

  const handleIOSChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (selectedDate) {
        setTempDate(selectedDate)
      }
    },
    [],
  )

  const handleIOSDone = useCallback(() => {
    onChange(tempDate)
    setShowPicker(false)
  }, [onChange, tempDate])

  const handleIOSCancel = useCallback(() => {
    setShowPicker(false)
  }, [])

  const displayValue = formatDate(value)

  return (
    <View>
      <Pressable onPress={openPicker} accessibilityRole="button" accessibilityLabel={label}>
        <View pointerEvents="none">
          <TextInput
            label={label}
            mode="outlined"
            value={displayValue}
            placeholder="Select date"
            editable={false}
            outlineColor={colors.inputBorder}
            activeOutlineColor={colors.brandPrimary}
            outlineStyle={styles.outline}
            style={{ backgroundColor: colors.inputBackground }}
            textColor={colors.textPrimary}
            right={<TextInput.Icon icon="calendar" color={colors.textTertiary} />}
          />
        </View>
      </Pressable>

      {/* Android: native dialog (no wrapping modal needed) */}
      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={handleAndroidChange}
        />
      )}

      {/* iOS: bottom modal with spinner and Done / Cancel buttons */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
          onRequestClose={handleIOSCancel}
        >
          <Pressable style={styles.modalOverlay} onPress={handleIOSCancel}>
            <Pressable style={styles.modalInner} onPress={undefined}>
              <Surface style={[styles.iosContainer, { backgroundColor: colors.cardBackground }]} elevation={4}>
                <View style={[styles.iosHeader, { borderBottomColor: colors.divider }]}>
                  <Button mode="text" onPress={handleIOSCancel} textColor={colors.textTertiary}>
                    Cancel
                  </Button>
                  <Text variant="titleSmall" style={[styles.iosTitle, { color: colors.textPrimary }]}>
                    {label}
                  </Text>
                  <Button mode="text" onPress={handleIOSDone} textColor={colors.brandPrimary}>
                    Done
                  </Button>
                </View>

                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  minimumDate={minimumDate}
                  onChange={handleIOSChange}
                  style={styles.iosPicker}
                />
              </Surface>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  outline: {
    borderRadius: 12,
  },
  /* ----- iOS modal ----- */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalInner: {
    /* Catches taps so they don't propagate to the overlay */
  },
  iosContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  iosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iosTitle: {
    fontWeight: '600',
  },
  iosPicker: {
    height: 200,
  },
})
