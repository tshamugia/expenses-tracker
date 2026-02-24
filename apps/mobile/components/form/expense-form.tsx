import { useState, useCallback } from 'react'
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native'
import { TextInput, Button, Switch, Text, HelperText } from 'react-native-paper'
import { CurrencyPicker } from './currency-picker'
import { CategoryPicker } from './category-picker'
import { PaymentCardPicker } from './payment-card-picker'
import { DatePicker } from './date-picker'
import { useAppTheme } from '@/lib/theme/theme-context'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface ExpenseFormValues {
  title: string
  amount: number
  currency: string
  description: string
  category: string | null
  isRecurring: boolean
  nextDueDate: string | null // ISO string
  paymentCardId: string | null
}

interface ExpenseFormProps {
  initialValues?: {
    title?: string
    amount?: string
    currency?: string
    description?: string
    category?: string | null
    isRecurring?: boolean
    nextDueDate?: Date | null
    paymentCardId?: string | null
  }
  onSubmit: (values: ExpenseFormValues) => void
  isLoading?: boolean
  submitLabel?: string
}

interface FormErrors {
  title?: string
  amount?: string
}

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

/**
 * Shared expense form used by both the create and edit screens.
 *
 * Manages its own local state (initialized from `initialValues`),
 * validates required fields on submit, and calls `onSubmit` with a
 * clean `ExpenseFormValues` object.
 *
 * Layout order:
 *  Title -> Amount -> CurrencyPicker -> Description ->
 *  CategoryPicker -> DatePicker -> Recurring switch ->
 *  PaymentCardPicker -> Submit button
 */
export function ExpenseForm({
  initialValues,
  onSubmit,
  isLoading = false,
  submitLabel = 'Save Expense',
}: ExpenseFormProps) {
  const { colors } = useAppTheme()

  // ── Field state ──────────────────────────────────────────────
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [amount, setAmount] = useState(initialValues?.amount ?? '')
  const [currency, setCurrency] = useState(initialValues?.currency ?? 'GEL')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [category, setCategory] = useState<string | null>(
    initialValues?.category ?? null,
  )
  const [isRecurring, setIsRecurring] = useState(
    initialValues?.isRecurring ?? false,
  )
  const [nextDueDate, setNextDueDate] = useState<Date | null>(
    initialValues?.nextDueDate ?? null,
  )
  const [paymentCardId, setPaymentCardId] = useState<string | null>(
    initialValues?.paymentCardId ?? null,
  )

  // ── Validation state ─────────────────────────────────────────
  const [errors, setErrors] = useState<FormErrors>({})

  // ── Handlers ─────────────────────────────────────────────────
  const handleTitleChange = useCallback((text: string) => {
    setTitle(text)
    setErrors((prev) => (prev.title ? { ...prev, title: undefined } : prev))
  }, [])

  const handleAmountChange = useCallback((text: string) => {
    // Allow only digits, a single decimal point, and leading minus
    const sanitized = text.replace(/[^0-9.]/g, '')
    setAmount(sanitized)
    setErrors((prev) => (prev.amount ? { ...prev, amount: undefined } : prev))
  }, [])

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }

    const numericAmount = parseFloat(amount)
    if (!amount.trim()) {
      newErrors.amount = 'Amount is required'
    } else if (isNaN(numericAmount) || numericAmount <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [title, amount])

  const handleSubmit = useCallback(() => {
    if (!validate()) return

    const values: ExpenseFormValues = {
      title: title.trim(),
      amount: parseFloat(amount),
      currency,
      description: description.trim(),
      category,
      isRecurring,
      nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
      paymentCardId,
    }

    onSubmit(values)
  }, [
    validate,
    title,
    amount,
    currency,
    description,
    category,
    isRecurring,
    nextDueDate,
    paymentCardId,
    onSubmit,
  ])

  // ── Render ───────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View>
          <TextInput
            label="Title"
            mode="outlined"
            value={title}
            onChangeText={handleTitleChange}
            placeholder="e.g. Netflix Subscription"
            error={!!errors.title}
            outlineColor={colors.inputBorder}
            activeOutlineColor={colors.brandPrimary}
            outlineStyle={styles.outline}
            style={{ backgroundColor: colors.inputBackground }}
            textColor={colors.textPrimary}
            accessibilityLabel="Expense title"
          />
          {errors.title ? (
            <HelperText type="error" visible>
              {errors.title}
            </HelperText>
          ) : null}
        </View>

        {/* Amount */}
        <View>
          <TextInput
            label="Amount"
            mode="outlined"
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={!!errors.amount}
            outlineColor={colors.inputBorder}
            activeOutlineColor={colors.brandPrimary}
            outlineStyle={styles.outline}
            style={{ backgroundColor: colors.inputBackground }}
            textColor={colors.textPrimary}
            left={<TextInput.Affix text={currency} textStyle={{ color: colors.textTertiary, fontWeight: '500' }} />}
            accessibilityLabel="Expense amount"
          />
          {errors.amount ? (
            <HelperText type="error" visible>
              {errors.amount}
            </HelperText>
          ) : null}
        </View>

        {/* Currency */}
        <CurrencyPicker value={currency} onChange={setCurrency} />

        {/* Description */}
        <TextInput
          label="Description"
          mode="outlined"
          value={description}
          onChangeText={setDescription}
          placeholder="Add a note (optional)"
          multiline
          numberOfLines={3}
          outlineColor={colors.inputBorder}
          activeOutlineColor={colors.brandPrimary}
          outlineStyle={styles.outline}
          style={{ backgroundColor: colors.inputBackground }}
          textColor={colors.textPrimary}
          accessibilityLabel="Expense description"
        />

        {/* Category */}
        <CategoryPicker value={category} onChange={setCategory} />

        {/* Due Date */}
        <DatePicker
          value={nextDueDate}
          onChange={setNextDueDate}
          label="Due Date"
        />

        {/* Recurring toggle */}
        <View style={[styles.switchRow, { backgroundColor: colors.screenBackgroundSecondary, borderColor: colors.inputBorder }]}>
          <View style={styles.switchLabel}>
            <Text variant="bodyLarge" style={[styles.switchLabelText, { color: colors.textPrimary }]}>
              Recurring
            </Text>
            <Text variant="bodySmall" style={[styles.switchHint, { color: colors.textMuted }]}>
              Automatically repeats on schedule
            </Text>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            color={colors.brandPrimary}
          />
        </View>

        {/* Payment Card */}
        <PaymentCardPicker value={paymentCardId} onChange={setPaymentCardId} />

        {/* Submit */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={isLoading}
          disabled={isLoading}
          buttonColor={colors.brandPrimary}
          textColor="#ffffff"
          contentStyle={styles.submitContent}
          labelStyle={styles.submitLabel}
          style={styles.submitButton}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          {submitLabel}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  outline: {
    borderRadius: 12,
  },
  /* Recurring switch row */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  switchLabel: {
    flex: 1,
    marginRight: 12,
  },
  switchLabelText: {
    fontWeight: '500',
  },
  switchHint: {
    marginTop: 2,
  },
  /* Submit button */
  submitButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  submitContent: {
    height: 52,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
})
