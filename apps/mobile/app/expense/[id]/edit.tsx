import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { ExpenseForm } from '@/components/form'
import type { ExpenseFormValues } from '@/components/form'
import { useExpense, useUpdateExpense } from '@/lib/hooks'
import { useSnackbar } from '@/lib/hooks/use-snackbar'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { ScreenLoading } from '@/components/screen-loading'
import { ScreenError } from '@/components/screen-error'

// ---------------------------------------------------------------------------
// Types (matching the API response shape)
// ---------------------------------------------------------------------------

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
  paymentCardId: string | null
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Screen for editing an existing expense.
 * Loads the expense data via useExpense, pre-fills the shared
 * ExpenseForm, and submits changes via useUpdateExpense.
 */
export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { showSnackbar } = useSnackbar()

  // Fetch existing expense data
  const { data: expense, isLoading, error, refetch } = useExpense(id!)

  // Update mutation
  const updateExpense = useUpdateExpense()

  // Convert the API expense data to ExpenseForm initialValues format
  const initialValues = useMemo(() => {
    if (!expense) return undefined
    const exp = expense as unknown as ExpenseData

    return {
      title: exp.title,
      amount: String(exp.amount),
      currency: exp.currency,
      description: exp.description || '',
      category: exp.category || null,
      isRecurring: exp.isRecurring,
      nextDueDate: exp.nextDueDate ? new Date(exp.nextDueDate) : null,
      paymentCardId: exp.paymentCardId || null,
    }
  }, [expense])

  const handleSubmit = (values: ExpenseFormValues) => {
    if (!id) return

    // Build the update body with the expense ID
    const body: Record<string, unknown> = {
      id,
      title: values.title,
      amount: values.amount,
      currency: values.currency,
    }

    // Include optional fields (send empty string as undefined to clear)
    if (values.description) body.description = values.description
    body.category = values.category
    body.isRecurring = values.isRecurring
    body.nextDueDate = values.nextDueDate
    body.paymentCardId = values.paymentCardId

    updateExpense.mutate(
      body as unknown as Parameters<typeof updateExpense.mutate>[0],
      {
        onSuccess: () => {
          showSnackbar('Expense updated successfully', 'success')
          router.back()
        },
        onError: (err) => {
          showSnackbar(getApiErrorMessage(err), 'error')
        },
      },
    )
  }

  // Loading and error states
  if (isLoading) return <ScreenLoading />
  if (error) return <ScreenError message={error.message} onRetry={refetch} />
  if (!expense) return <ScreenError message="Expense not found" />

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Edit Expense' }} />
      <ExpenseForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isLoading={updateExpense.isPending}
        submitLabel="Update Expense"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
})
