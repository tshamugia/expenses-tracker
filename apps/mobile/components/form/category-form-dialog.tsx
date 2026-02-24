import { useState, useEffect } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { Button, Dialog, Portal, Text, TextInput, HelperText } from 'react-native-paper'
import { useCreateCategory, useUpdateCategory, useSnackbar } from '@/lib/hooks'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const PRESET_COLORS = [
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#EF4444',
  '#14B8A6',
]

interface CategoryFormDialogProps {
  visible: boolean
  onDismiss: () => void
  initialValues?: {
    id: string
    categoryName: string
    color: string
  }
}

export function CategoryFormDialog({
  visible,
  onDismiss,
  initialValues,
}: CategoryFormDialogProps) {
  const isEditMode = !!initialValues
  const { showSnackbar } = useSnackbar()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()

  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (visible) {
      setName(initialValues?.categoryName ?? '')
      setColor(initialValues?.color ?? PRESET_COLORS[0])
      setNameError('')
    }
  }, [visible, initialValues])

  const isPending = createCategory.isPending || updateCategory.isPending

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Category name is required')
      return
    }
    if (trimmed.length > 50) {
      setNameError('Category name must be 50 characters or less')
      return
    }
    setNameError('')

    if (isEditMode) {
      updateCategory.mutate(
        { id: initialValues!.id, categoryName: trimmed, color },
        {
          onSuccess: () => {
            showSnackbar('Category updated', 'success')
            onDismiss()
          },
          onError: (err) => showSnackbar(getApiErrorMessage(err), 'error'),
        },
      )
    } else {
      createCategory.mutate(
        { categoryName: trimmed, color },
        {
          onSuccess: () => {
            showSnackbar('Category created', 'success')
            onDismiss()
          },
          onError: (err) => showSnackbar(getApiErrorMessage(err), 'error'),
        },
      )
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
          {isEditMode ? 'Edit Category' : 'New Category'}
        </Dialog.Title>
        <Dialog.Content>
          <TextInput
            label="Category Name"
            value={name}
            onChangeText={(text) => {
              setName(text)
              if (nameError) setNameError('')
            }}
            mode="outlined"
            error={!!nameError}
            style={styles.input}
            outlineStyle={styles.inputOutline}
            maxLength={50}
          />
          {nameError ? (
            <HelperText type="error" visible>
              {nameError}
            </HelperText>
          ) : null}

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
        </Dialog.Content>
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
            {isEditMode ? 'Update' : 'Create'}
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
  },
  dialogTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  input: {
    backgroundColor: '#ffffff',
  },
  inputOutline: {
    borderRadius: 12,
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
