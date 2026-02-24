import { useState, useMemo, useCallback } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { Text, Surface, Button, Divider, IconButton } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import {
  useExpense,
  useMarkExpensePaid,
  useDeleteExpense,
} from '@/lib/hooks'
import { useSnackbar } from '@/lib/hooks/use-snackbar'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { ScreenLoading } from '@/components/screen-loading'
import { ScreenError } from '@/components/screen-error'
import { StatusBadge } from '@/components/status-badge'
import { CategoryChip } from '@/components/category-chip'
import { PaymentCardChip } from '@/components/payment-card-chip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  formatCurrency,
  formatExpenseDate,
  isOverdue as checkIsOverdue,
  formatRelativeDate,
} from '@extracker/core'

// ---------------------------------------------------------------------------
// Types for the API response (already serialized to numbers by the API)
// ---------------------------------------------------------------------------

interface PaymentData {
  id: string
  dueDate: string | null
  amount: number
  paid: boolean
  paidAt: string | null
  snoozedUntil: string | null
}

interface PaymentCardData {
  id: string
  nickname: string | null
  lastFourDigits: string
  cardBrand: string
  color: string
}

interface ExpenseData {
  id: string
  title: string
  amount: number
  currency: string
  description: string | null
  category: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  startDate: string | null
  nextDueDate: string | null
  createdAt: string
  updatedAt: string
  payments: PaymentData[]
  paymentCard: PaymentCardData | null
  paymentCardId: string | null
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { showSnackbar } = useSnackbar()

  // Data fetching
  const { data: expense, isLoading, error, refetch } = useExpense(id!)

  // Mutations
  const markPaid = useMarkExpensePaid()
  const deleteExpense = useDeleteExpense()

  // Local UI state
  const [showDelete, setShowDelete] = useState(false)

  // Derive payment status from expense data
  const { isPaid, isExpenseOverdue } = useMemo(() => {
    if (!expense) return { isPaid: false, isExpenseOverdue: false }
    const exp = expense as unknown as ExpenseData

    const allPaid =
      exp.payments.length > 0
        ? exp.payments.every((p) => p.paid)
        : false

    const overdue = checkIsOverdue(
      exp.nextDueDate ? new Date(exp.nextDueDate) : null,
    )

    return { isPaid: allPaid, isExpenseOverdue: overdue && !allPaid }
  }, [expense])

  // Amount text color: green when paid, red when overdue, default otherwise
  const amountColor = isPaid
    ? '#16A34A'
    : isExpenseOverdue
      ? '#DC2626'
      : '#111827'

  // Handlers
  const handleMarkPaid = useCallback(() => {
    if (!id) return
    markPaid.mutate(id, {
      onSuccess: () => {
        showSnackbar('Expense marked as paid', 'success')
      },
      onError: (err) => {
        showSnackbar(getApiErrorMessage(err), 'error')
      },
    })
  }, [id, markPaid, showSnackbar])

  const handleDelete = useCallback(() => {
    if (!id) return
    deleteExpense.mutate(id, {
      onSuccess: () => {
        showSnackbar('Expense deleted', 'success')
        router.back()
      },
      onError: (err) => {
        showSnackbar(getApiErrorMessage(err), 'error')
      },
    })
  }, [id, deleteExpense, showSnackbar, router])

  // Loading and error states
  if (isLoading) return <ScreenLoading />
  if (error) return <ScreenError message={error.message} onRetry={refetch} />
  if (!expense) return <ScreenError message="Expense not found" />

  const exp = expense as unknown as ExpenseData

  return (
    <View style={styles.container}>
      {/* Dynamic header title and action buttons */}
      <Stack.Screen
        options={{
          title: exp.title,
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                icon="pencil"
                iconColor="#ffffff"
                size={22}
                onPress={() => router.push(`/expense/${id}/edit`)}
                accessibilityLabel="Edit expense"
                accessibilityRole="button"
              />
              <IconButton
                icon="delete"
                iconColor="#ffffff"
                size={22}
                onPress={() => setShowDelete(true)}
                accessibilityLabel="Delete expense"
                accessibilityRole="button"
              />
            </View>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Amount Section ────────────────────────────────────── */}
        <View style={styles.amountSection}>
          <Text
            variant="headlineLarge"
            style={[styles.amountText, { color: amountColor }]}
          >
            {formatCurrency(exp.amount, exp.currency)}
          </Text>
          <StatusBadge isPaid={isPaid} isOverdue={isExpenseOverdue} />
          <Text variant="bodyMedium" style={styles.currencyCode}>
            {exp.currency}
          </Text>
        </View>

        {/* ── Details Card ──────────────────────────────────────── */}
        <Surface style={styles.detailsCard} elevation={1}>
          {exp.category ? (
            <DetailRow label="Category">
              <CategoryChip name={exp.category} />
            </DetailRow>
          ) : null}

          {exp.nextDueDate ? (
            <>
              {exp.category ? <Divider style={styles.divider} /> : null}
              <DetailRow label="Due Date">
                <View style={styles.dueDateValue}>
                  <Text variant="bodyMedium" style={styles.detailValue}>
                    {formatExpenseDate(new Date(exp.nextDueDate))}
                  </Text>
                  <Text variant="bodySmall" style={styles.relativeDateText}>
                    {formatRelativeDate(new Date(exp.nextDueDate))}
                  </Text>
                </View>
              </DetailRow>
            </>
          ) : null}

          {exp.isRecurring ? (
            <>
              <Divider style={styles.divider} />
              <DetailRow label="Recurring">
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {exp.recurrenceRule || 'Yes'}
                </Text>
              </DetailRow>
            </>
          ) : null}

          {exp.description ? (
            <>
              <Divider style={styles.divider} />
              <DetailRow label="Description">
                <Text variant="bodyMedium" style={styles.descriptionText}>
                  {exp.description}
                </Text>
              </DetailRow>
            </>
          ) : null}

          {exp.paymentCard ? (
            <>
              <Divider style={styles.divider} />
              <DetailRow label="Payment Card">
                <PaymentCardChip paymentCard={exp.paymentCard} />
              </DetailRow>
            </>
          ) : null}
        </Surface>

        {/* ── Mark as Paid Button ───────────────────────────────── */}
        {!isPaid ? (
          <Button
            mode="contained"
            onPress={handleMarkPaid}
            loading={markPaid.isPending}
            disabled={markPaid.isPending}
            buttonColor="#16A34A"
            textColor="#ffffff"
            icon="check-circle"
            contentStyle={styles.markPaidContent}
            labelStyle={styles.markPaidLabel}
            style={styles.markPaidButton}
            accessibilityRole="button"
            accessibilityLabel="Mark expense as paid"
          >
            Mark as Paid
          </Button>
        ) : null}

        {/* ── Payment History ───────────────────────────────────── */}
        {exp.payments.length > 0 ? (
          <View style={styles.historySection}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Payment History
            </Text>

            <Surface style={styles.historyCard} elevation={1}>
              {exp.payments.map((payment, index) => (
                <View key={payment.id}>
                  {index > 0 ? <Divider style={styles.divider} /> : null}
                  <PaymentRow payment={payment} currency={exp.currency} />
                </View>
              ))}
            </Surface>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Delete Confirmation Dialog ──────────────────────────── */}
      <ConfirmDialog
        visible={showDelete}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteExpense.isPending}
        onConfirm={handleDelete}
        onDismiss={() => setShowDelete(false)}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Reusable row layout for the details card.
 * Label on the left, child content on the right.
 */
function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodySmall" style={styles.detailLabel}>
        {label}
      </Text>
      {children}
    </View>
  )
}

/**
 * Individual payment history row showing date, amount, and paid status.
 */
function PaymentRow({
  payment,
  currency,
}: {
  payment: PaymentData
  currency: string
}) {
  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentLeft}>
        <Text variant="bodyMedium" style={styles.paymentDate}>
          {payment.dueDate
            ? formatExpenseDate(new Date(payment.dueDate))
            : 'No date'}
        </Text>
        <Text variant="bodySmall" style={styles.paymentAmount}>
          {formatCurrency(payment.amount, currency)}
        </Text>
      </View>

      <View style={styles.paymentRight}>
        {payment.paid ? (
          <View style={styles.paymentStatusRow}>
            <MaterialCommunityIcons
              name="check-circle"
              size={16}
              color="#16A34A"
            />
            <View style={styles.paidTextColumn}>
              <Text variant="bodySmall" style={styles.paidText}>
                Paid
              </Text>
              {payment.paidAt ? (
                <Text variant="labelSmall" style={styles.paidAtText}>
                  {formatExpenseDate(new Date(payment.paidAt))}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.paymentStatusRow}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={16}
              color="#9CA3AF"
            />
            <Text variant="bodySmall" style={styles.unpaidText}>
              Unpaid
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // Header
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },

  // Amount section
  amountSection: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  amountText: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  currencyCode: {
    color: '#9CA3AF',
  },

  // Details card
  detailsCard: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    gap: 12,
  },
  detailLabel: {
    color: '#6B7280',
    fontWeight: '500',
    flexShrink: 0,
  },
  detailValue: {
    color: '#111827',
    textAlign: 'right',
  },
  dueDateValue: {
    alignItems: 'flex-end',
    gap: 2,
  },
  relativeDateText: {
    color: '#9CA3AF',
  },
  descriptionText: {
    color: '#374151',
    flex: 1,
    textAlign: 'right',
    lineHeight: 22,
  },
  divider: {
    marginVertical: 8,
    backgroundColor: '#F3F4F6',
  },

  // Mark as paid button
  markPaidButton: {
    borderRadius: 12,
  },
  markPaidContent: {
    height: 48,
  },
  markPaidLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Payment history section
  historySection: {
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  paymentLeft: {
    gap: 2,
    flex: 1,
  },
  paymentDate: {
    color: '#111827',
    fontWeight: '500',
  },
  paymentAmount: {
    color: '#6B7280',
  },
  paymentRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paidTextColumn: {
    alignItems: 'flex-end',
  },
  paidText: {
    color: '#16A34A',
    fontWeight: '600',
  },
  paidAtText: {
    color: '#9CA3AF',
    marginTop: 1,
  },
  unpaidText: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
})
