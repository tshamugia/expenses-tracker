import { ActivityIndicator, StyleSheet } from 'react-native'
import { Button, Dialog, Portal, Text } from 'react-native-paper'
import { useAppTheme } from '@/lib/theme/theme-context'

interface ConfirmDialogProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onDismiss: () => void
  loading?: boolean
  destructive?: boolean
}

/**
 * Confirmation dialog built on React Native Paper's Portal and Dialog.
 *
 * Requires a `<Portal.Host />` in a parent layout (PaperProvider includes
 * one automatically). Supports a destructive variant with red confirm
 * button and a loading state that disables both actions.
 *
 * Usage:
 *   <ConfirmDialog
 *     visible={showDelete}
 *     title="Delete Expense"
 *     message="This action cannot be undone."
 *     confirmLabel="Delete"
 *     destructive
 *     loading={isDeleting}
 *     onConfirm={handleDelete}
 *     onDismiss={() => setShowDelete(false)}
 *   />
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onDismiss,
  loading = false,
  destructive = false,
}: ConfirmDialogProps) {
  const { colors } = useAppTheme()
  const confirmColor = destructive ? colors.error : colors.brandPrimary

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={loading ? undefined : onDismiss}
        style={[styles.dialog, { backgroundColor: colors.cardBackground }]}
      >
        <Dialog.Title style={[styles.title, { color: colors.textPrimary }]}>
          {title}
        </Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={[styles.message, { color: colors.textTertiary }]}>
            {message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button
            mode="text"
            onPress={onDismiss}
            disabled={loading}
            textColor={colors.textTertiary}
          >
            {cancelLabel}
          </Button>
          <Button
            mode="contained"
            onPress={onConfirm}
            disabled={loading}
            buttonColor={confirmColor}
            style={styles.confirmButton}
          >
            {loading ? (
              <ActivityIndicator size={16} color="#ffffff" />
            ) : (
              confirmLabel
            )}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
  },
  title: {
    fontWeight: '600',
  },
  message: {
    lineHeight: 22,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  confirmButton: {
    borderRadius: 12,
  },
})
