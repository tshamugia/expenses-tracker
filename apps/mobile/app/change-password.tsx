import { useState } from 'react'
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native'
import { TextInput, Button, HelperText } from 'react-native-paper'
import { Stack, useRouter } from 'expo-router'
import { useChangePassword, useSnackbar } from '@/lib/hooks'
import { getApiErrorMessage } from '@/lib/utils/api-error'

export default function ChangePasswordScreen() {
  const router = useRouter()
  const { showSnackbar } = useSnackbar()
  const changePassword = useChangePassword()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!currentPassword) {
      newErrors.currentPassword = 'Current password is required'
    }
    if (!newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters'
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password'
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          showSnackbar('Password changed successfully', 'success')
          router.back()
        },
        onError: (err) => {
          const message = getApiErrorMessage(err)
          if (message.toLowerCase().includes('incorrect') || message.toLowerCase().includes('wrong')) {
            setErrors({ currentPassword: 'Current password is incorrect' })
          } else {
            showSnackbar(message, 'error')
          }
        },
      },
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Change Password',
          headerStyle: { backgroundColor: '#6366F1' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            label="Current Password"
            value={currentPassword}
            onChangeText={(t) => {
              setCurrentPassword(t)
              clearError('currentPassword')
            }}
            mode="outlined"
            secureTextEntry={!showCurrent}
            error={!!errors.currentPassword}
            style={styles.input}
            outlineStyle={styles.inputOutline}
            right={
              <TextInput.Icon
                icon={showCurrent ? 'eye-off' : 'eye'}
                onPress={() => setShowCurrent(!showCurrent)}
              />
            }
          />
          {errors.currentPassword ? (
            <HelperText type="error" visible>
              {errors.currentPassword}
            </HelperText>
          ) : null}

          <TextInput
            label="New Password"
            value={newPassword}
            onChangeText={(t) => {
              setNewPassword(t)
              clearError('newPassword')
            }}
            mode="outlined"
            secureTextEntry={!showNew}
            error={!!errors.newPassword}
            style={styles.input}
            outlineStyle={styles.inputOutline}
            right={
              <TextInput.Icon
                icon={showNew ? 'eye-off' : 'eye'}
                onPress={() => setShowNew(!showNew)}
              />
            }
          />
          {errors.newPassword ? (
            <HelperText type="error" visible>
              {errors.newPassword}
            </HelperText>
          ) : null}

          <TextInput
            label="Confirm New Password"
            value={confirmPassword}
            onChangeText={(t) => {
              setConfirmPassword(t)
              clearError('confirmPassword')
            }}
            mode="outlined"
            secureTextEntry={!showConfirm}
            error={!!errors.confirmPassword}
            style={styles.input}
            outlineStyle={styles.inputOutline}
            right={
              <TextInput.Icon
                icon={showConfirm ? 'eye-off' : 'eye'}
                onPress={() => setShowConfirm(!showConfirm)}
              />
            }
          />
          {errors.confirmPassword ? (
            <HelperText type="error" visible>
              {errors.confirmPassword}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={changePassword.isPending}
            disabled={changePassword.isPending}
            buttonColor="#6366F1"
            style={styles.submitButton}
            contentStyle={styles.submitContent}
          >
            Change Password
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 24,
    gap: 4,
  },
  input: {
    backgroundColor: '#ffffff',
  },
  inputOutline: {
    borderRadius: 12,
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 12,
  },
  submitContent: {
    height: 52,
  },
})
