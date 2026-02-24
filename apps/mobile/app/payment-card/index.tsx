import { useState, useCallback } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { FAB } from 'react-native-paper'
import { ScreenLoading, ScreenError, EmptyState, ConfirmDialog } from '@/components'
import { PaymentCardCard } from '@/components/payment-card-card'
import { PaymentCardFormDialog } from '@/components/form/payment-card-form-dialog'
import { usePaymentCards, useDeletePaymentCard, useSnackbar } from '@/lib/hooks'
import { useAppTheme } from '@/lib/theme/theme-context'
import { AnimatedListItem } from '@/components/animated-list-item'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { hapticMedium, hapticError } from '@/lib/utils/haptics'

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
  const { colors } = useAppTheme()
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
        hapticMedium()
        showSnackbar('Payment card deleted', 'success')
        setDeleteTarget(null)
      },
      onError: (err) => {
        hapticError()
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
    <View style={[styles.container, { backgroundColor: colors.screenBackgroundSecondary }]}>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index}>
            <PaymentCardCard
              card={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => setDeleteTarget(item.id)}
            />
          </AnimatedListItem>
        )}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            colors={[colors.refreshTint]}
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
        style={[styles.fab, { backgroundColor: colors.fabBackground }]}
        color={colors.fabText}
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
    borderRadius: 16,
  },
})
