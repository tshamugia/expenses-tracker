import { View, StyleSheet } from 'react-native'
import { Text, Surface, TouchableRipple } from 'react-native-paper'
import { formatCurrency } from '@extracker/core'
import { formatRelativeDate } from '@extracker/core'
import type { ExpenseListItem } from '@extracker/types'
import { useAppTheme } from '@/lib/theme/theme-context'
import { StatusBadge } from './status-badge'
import { CategoryChip } from './category-chip'

interface ExpenseCardProps {
  expense: ExpenseListItem
  onPress?: () => void
}

/**
 * Primary list-item component for rendering an expense.
 * Displays the title, category, status, relative due date,
 * formatted amount, and currency code.
 *
 * Amount color is determined by payment status:
 *  - Green (colors.success) when paid
 *  - Red (colors.error) when overdue
 *  - Default (colors.textPrimary) when pending
 */
export function ExpenseCard({ expense, onPress }: ExpenseCardProps) {
  const { colors } = useAppTheme()

  const amountColor = expense.isPaid
    ? colors.success
    : expense.isOverdue
      ? colors.error
      : colors.textPrimary

  return (
    <TouchableRipple
      onPress={onPress}
      borderless
      style={styles.ripple}
      rippleColor="rgba(99, 102, 241, 0.08)"
    >
      <Surface style={[styles.surface, { backgroundColor: colors.cardBackground }]} elevation={1}>
        <View style={styles.row}>
          {/* Left column: title, metadata, date */}
          <View style={styles.leftColumn}>
            <Text
              variant="bodyLarge"
              style={[styles.title, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {expense.title}
            </Text>

            <View style={styles.metaRow}>
              {expense.category ? (
                <CategoryChip name={expense.category} />
              ) : null}
              <StatusBadge
                isPaid={expense.isPaid}
                isOverdue={expense.isOverdue}
              />
            </View>

            <Text variant="bodySmall" style={[styles.date, { color: colors.textMuted }]}>
              {formatRelativeDate(expense.nextDueDate)}
            </Text>
          </View>

          {/* Right column: amount and currency */}
          <View style={styles.rightColumn}>
            <Text
              variant="titleMedium"
              style={[styles.amount, { color: amountColor }]}
              numberOfLines={1}
            >
              {formatCurrency(expense.amount, expense.currency)}
            </Text>
            <Text variant="bodySmall" style={[styles.currency, { color: colors.textMuted }]}>
              {expense.currency}
            </Text>
          </View>
        </View>
      </Surface>
    </TouchableRipple>
  )
}

const styles = StyleSheet.create({
  ripple: {
    borderRadius: 12,
  },
  surface: {
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftColumn: {
    flex: 1,
    marginRight: 12,
    gap: 8,
  },
  title: {
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  date: {},
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  amount: {
    fontWeight: '700',
  },
  currency: {
    marginTop: 2,
  },
})
