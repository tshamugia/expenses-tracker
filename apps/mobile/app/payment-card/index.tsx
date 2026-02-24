import { useState, useCallback } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { FAB } from 'react-native-paper'
import { ScreenLoading, ScreenError, EmptyState, ConfirmDialog } from '@/components'
import { PaymentCardCard } from '@/components/payment-card-card'
import { PaymentCardFormDialog } from '@/components/form/payment-card-form-dialog'
import { usePaymentCards, useDeletePaymentCard, useSnackbar } from '@/lib/hooks'
import { getApiErrorMessage } from '@/lib/utils/api-error'

interface EditTarget {
  id: string
  cardholderName: string
  lastFourDigits: string
  expiryMonth: number
  expiryYear: number
  nickname: string | null
  color: string
}

export default function PaymentCardsScreen() {
  const { showSnackbar } = useSnackbar()
  const { data, isLoading, isError, error, refetch } = usePaymentCards()
  const deleteCard = useDeletePaymentCard()

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const cards = data?.data ?? []

  const handleEdit = useCallback((card: EditTarget) => {
    setEditTarget(card)
    setShowForm(true)
  }, [])

  const handleCreate = useCallback(() => {
    setEditTarget(null)
    setShowForm(true)
  }, [])

  const handleDismissForm = useCallback(() => {
    setShowForm(false)
    setEditTarget(null)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return
    deleteCard.mutate(deleteTarget, {
      onSuccess: () => {
        showSnackbar('Payment card deleted', 'success')
        setDeleteTarget(null)
      },
      onError: (err) => {
        showSnackbar(getApiErrorMessage(err), 'error')
        setDeleteTarget(null)
      },
    })
  }, [deleteTarget, deleteCard, showSnackbar])

  if (isLoading) return <ScreenLoading />
  if (isError) {
    return (
      <ScreenError
        message={getApiErrorMessage(error)}
        onRetry={refetch}
      />
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PaymentCardCard
            card={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => setDeleteTarget(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            colors={['#6366F1']}
          />
        }
        contentContainerStyle={
          cards.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          <EmptyState
            icon="credit-card-off"
            title="No payment cards"
            description="Add a payment card to link it to your expenses."
            actionLabel="Add Card"
            onAction={handleCreate}
          />
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color="#ffffff"
        onPress={handleCreate}
      />

      <PaymentCardFormDialog
        visible={showForm}
        onDismiss={handleDismissForm}
        initialValues={editTarget ?? undefined}
      />

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete Payment Card"
        message="This will unlink the card from associated expenses. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteCard.isPending}
        onConfirm={handleConfirmDelete}
        onDismiss={() => setDeleteTarget(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#6366F1',
    borderRadius: 16,
  },
})
