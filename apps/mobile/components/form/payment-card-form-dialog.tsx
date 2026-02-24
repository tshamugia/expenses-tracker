import { useState, useEffect } from 'react'
import { View, ScrollView, StyleSheet, Pressable } from 'react-native'
import { Button, Dialog, Portal, Text, TextInput, HelperText } from 'react-native-paper'
import { useCreatePaymentCard, useUpdatePaymentCard, useSnackbar } from '@/lib/hooks'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const PRESET_COLORS = [
  '#1E40AF',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#14B8A6',
]

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '')
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

interface PaymentCardFormDialogProps {
  visible: boolean
  onDismiss: () => void
  initialValues?: {
    id: string
    cardholderName: string
    lastFourDigits: string
    expiryMonth: number
    expiryYear: number
    nickname: string | null
    color: string
  }
}

export function PaymentCardFormDialog({
  visible,
  onDismiss,
  initialValues,
}: PaymentCardFormDialogProps) {
  const isEditMode = !!initialValues
  const { showSnackbar } = useSnackbar()
  const createCard = useCreatePaymentCard()
  const updateCard = useUpdatePaymentCard()

  const [cardholderName, setCardholderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('')
  const [expiryYear, setExpiryYear] = useState('')
  const [nickname, setNickname] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (visible) {
      setCardholderName(initialValues?.cardholderName ?? '')
      setCardNumber('')
      setExpiryMonth(initialValues ? String(initialValues.expiryMonth) : '')
      setExpiryYear(initialValues ? String(initialValues.expiryYear) : '')
      setNickname(initialValues?.nickname ?? '')
      setColor(initialValues?.color ?? PRESET_COLORS[0])
      setErrors({})
    }
  }, [visible, initialValues])

  const isPending = createCard.isPending || updateCard.isPending

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!cardholderName.trim()) {
      newErrors.cardholderName = 'Cardholder name is required'
    }

    if (!isEditMode) {
      const digits = cardNumber.replace(/\D/g, '')
      if (!digits) {
        newErrors.cardNumber = 'Card number is required'
      } else if (digits.length < 13 || digits.length > 19) {
        newErrors.cardNumber = 'Card number must be 13-19 digits'
      } else if (!luhnCheck(digits)) {
        newErrors.cardNumber = 'Invalid card number'
      }
    }

    const month = parseInt(expiryMonth, 10)
    if (!expiryMonth || isNaN(month) || month < 1 || month > 12) {
      newErrors.expiryMonth = 'Valid month (1-12) required'
    }

    const year = parseInt(expiryYear, 10)
    if (!expiryYear || isNaN(year) || year < 2000 || year > 2100) {
      newErrors.expiryYear = 'Valid year required'
    }

    if (!newErrors.expiryMonth && !newErrors.expiryYear) {
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()
      if (year < currentYear || (year === currentYear && month < currentMonth)) {
        newErrors.expiryMonth = 'Card has expired'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return

    if (isEditMode) {
      updateCard.mutate(
        {
          id: initialValues!.id,
          cardholderName: cardholderName.trim(),
          expiryMonth: parseInt(expiryMonth, 10),
          expiryYear: parseInt(expiryYear, 10),
          nickname: nickname.trim() || undefined,
          color,
        },
        {
          onSuccess: () => {
            showSnackbar('Payment card updated', 'success')
            onDismiss()
          },
          onError: (err) => showSnackbar(getApiErrorMessage(err), 'error'),
        },
      )
    } else {
      createCard.mutate(
        {
          cardholderName: cardholderName.trim(),
          cardNumber: cardNumber.replace(/\D/g, ''),
          expiryMonth: parseInt(expiryMonth, 10),
          expiryYear: parseInt(expiryYear, 10),
          nickname: nickname.trim() || undefined,
          color,
        },
        {
          onSuccess: () => {
            showSnackbar('Payment card added', 'success')
            onDismiss()
          },
          onError: (err) => showSnackbar(getApiErrorMessage(err), 'error'),
        },
      )
    }
  }

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={isPending ? undefined : onDismiss}
        style={styles.dialog}
      >
        <Dialog.Title style={styles.dialogTitle}>
          {isEditMode ? 'Edit Card' : 'Add Card'}
        </Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            <View style={styles.formContent}>
              <TextInput
                label="Cardholder Name"
                value={cardholderName}
                onChangeText={(t) => {
                  setCardholderName(t)
                  clearError('cardholderName')
                }}
                mode="outlined"
                error={!!errors.cardholderName}
                style={styles.input}
                outlineStyle={styles.inputOutline}
              />
              {errors.cardholderName ? (
                <HelperText type="error" visible>
                  {errors.cardholderName}
                </HelperText>
              ) : null}

              {!isEditMode && (
                <>
                  <TextInput
                    label="Card Number"
                    value={cardNumber}
                    onChangeText={(t) => {
                      setCardNumber(t)
                      clearError('cardNumber')
                    }}
                    mode="outlined"
                    error={!!errors.cardNumber}
                    keyboardType="numeric"
                    maxLength={19}
                    style={styles.input}
                    outlineStyle={styles.inputOutline}
                  />
                  {errors.cardNumber ? (
                    <HelperText type="error" visible>
                      {errors.cardNumber}
                    </HelperText>
                  ) : null}
                </>
              )}

              <View style={styles.expiryRow}>
                <View style={styles.expiryField}>
                  <TextInput
                    label="Month"
                    value={expiryMonth}
                    onChangeText={(t) => {
                      setExpiryMonth(t)
                      clearError('expiryMonth')
                    }}
                    mode="outlined"
                    error={!!errors.expiryMonth}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="MM"
                    style={styles.input}
                    outlineStyle={styles.inputOutline}
                  />
                  {errors.expiryMonth ? (
                    <HelperText type="error" visible>
                      {errors.expiryMonth}
                    </HelperText>
                  ) : null}
                </View>
                <View style={styles.expiryField}>
                  <TextInput
                    label="Year"
                    value={expiryYear}
                    onChangeText={(t) => {
                      setExpiryYear(t)
                      clearError('expiryYear')
                    }}
                    mode="outlined"
                    error={!!errors.expiryYear}
                    keyboardType="numeric"
                    maxLength={4}
                    placeholder="YYYY"
                    style={styles.input}
                    outlineStyle={styles.inputOutline}
                  />
                  {errors.expiryYear ? (
                    <HelperText type="error" visible>
                      {errors.expiryYear}
                    </HelperText>
                  ) : null}
                </View>
              </View>

              <TextInput
                label="Nickname (optional)"
                value={nickname}
                onChangeText={setNickname}
                mode="outlined"
                style={styles.input}
                outlineStyle={styles.inputOutline}
              />

              <Text variant="bodyMedium" style={styles.colorLabel}>
                Color
              </Text>
              <View style={styles.colorRow}>
                {PRESET_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      color === c && styles.colorSelected,
                    ]}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions style={styles.actions}>
          <Button
            mode="text"
            onPress={onDismiss}
            disabled={isPending}
            textColor="#6B7280"
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={isPending}
            disabled={isPending}
            buttonColor="#6366F1"
            style={styles.submitButton}
          >
            {isEditMode ? 'Update' : 'Add Card'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    maxHeight: '80%',
  },
  dialogTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  formContent: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    marginTop: 8,
  },
  inputOutline: {
    borderRadius: 12,
  },
  expiryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  expiryField: {
    flex: 1,
  },
  colorLabel: {
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#111827',
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  submitButton: {
    borderRadius: 12,
  },
})
