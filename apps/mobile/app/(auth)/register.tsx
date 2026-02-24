import { useState } from 'react'
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { Text, TextInput, Button, HelperText } from 'react-native-paper'
import { Link } from 'expo-router'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/lib/stores/auth-store'

export default function RegisterScreen() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)

  function validate(): string | null {
    if (!email.trim()) return 'Email is required'
    if (!/\S+@\S+\.\S+/.test(email.trim())) return 'Please enter a valid email'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (password !== confirmPassword) return 'Passwords do not match'
    return null
  }

  async function handleRegister() {
    setError('')

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const { data, error: apiError } = await api.auth.register.post({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim() || undefined,
      })

      if (apiError) {
        const errorBody = apiError.value as { error?: string } | undefined
        setError(errorBody?.error || 'Registration failed. Please try again.')
        return
      }

      if (data?.success && data.data) {
        const { user, accessToken, refreshToken } = data.data
        await login(
          { id: user.id, email: user.email, name: user.name, image: user.image },
          accessToken,
          refreshToken
        )
      } else {
        setError('Registration failed. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="displaySmall" style={styles.title}>
            ExTracker
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Create your account
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Name (optional)"
            value={name}
            onChangeText={setName}
            mode="outlined"
            autoCapitalize="words"
            autoComplete="name"
            style={styles.input}
            outlineColor="#D1D5DB"
            activeOutlineColor="#6366F1"
          />

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
            outlineColor="#D1D5DB"
            activeOutlineColor="#6366F1"
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            style={styles.input}
            outlineColor="#D1D5DB"
            activeOutlineColor="#6366F1"
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />

          <TextInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            style={styles.input}
            outlineColor="#D1D5DB"
            activeOutlineColor="#6366F1"
          />

          {error ? (
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleRegister}
            loading={loading}
            disabled={loading}
            style={styles.button}
            buttonColor="#6366F1"
          >
            Create Account
          </Button>

          <View style={styles.footer}>
            <Text variant="bodyMedium" style={styles.footerText}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Text variant="bodyMedium" style={styles.link}>
                Sign In
              </Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontWeight: '700',
    color: '#6366F1',
    marginBottom: 8,
  },
  subtitle: {
    color: '#6B7280',
  },
  form: {
    gap: 4,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#6B7280',
  },
  link: {
    color: '#6366F1',
    fontWeight: '600',
  },
})
