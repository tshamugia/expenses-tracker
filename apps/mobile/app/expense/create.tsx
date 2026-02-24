import { View, StyleSheet } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { ExpenseForm } from '@/components/form'
import type { ExpenseFormValues } from '@/components/form'
import { useCreateExpense } from '@/lib/hooks'
import { useSnackbar } from '@/lib/hooks/use-snackbar'
import { getApiErrorMessage } from '@/lib/utils/api-error'

/**
 * Screen for creating a new expense.
 * Renders the shared ExpenseForm with no initial values and
 * delegates submission to the useCreateExpense mutation.
 */
export default function CreateExpenseScreen() {
  const router = useRouter()
  const createExpense = useCreateExpense()
  const { showSnackbar } = useSnackbar()

  const handleSubmit = (values: ExpenseFormValues) => {
    // Build the request body, only including non-empty optional fields
    // to avoid sending null/undefined values to the API
    const body: Record<string, unknown> = {
      title: values.title,
      amount: values.amount,
      currency: values.currency,
    }

    if (values.description) body.description = values.description
    if (values.category) body.category = values.category
    if (values.isRecurring) body.isRecurring = values.isRecurring
    if (values.nextDueDate) body.nextDueDate = values.nextDueDate
    if (values.paymentCardId) body.paymentCardId = values.paymentCardId

    createExpense.mutate(body as unknown as Parameters<typeof createExpense.mutate>[0], {
      onSuccess: () => {
        showSnackbar('Expense created successfully', 'success')
        router.back()
      },
      onError: (error) => {
        showSnackbar(getApiErrorMessage(error), 'error')
      },
    })
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'New Expense' }} />
      <ExpenseForm
        onSubmit={handleSubmit}
        isLoading={createExpense.isPending}
        submitLabel="Create Expense"
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
