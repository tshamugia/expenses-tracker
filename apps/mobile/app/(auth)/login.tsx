import { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Text, TextInput, Button, HelperText } from "react-native-paper";
import { Link } from "expo-router";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useAppTheme } from "@/lib/theme/theme-context";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const { colors } = useAppTheme();

  async function handleLogin() {
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      const { data, error: apiError } = await api.auth.login.post({
        email: email.trim().toLowerCase(),
        password,
      });

      if (apiError) {
        const errorBody = apiError.value as { error?: string } | undefined;
        const message =
          typeof errorBody === "object" && errorBody?.error
            ? errorBody.error
            : typeof apiError.value === "string"
              ? apiError.value
              : "Login failed. Please check your credentials.";
        setError(message);
        return;
      }

      if (data?.success && data.data) {
        const { user, accessToken, refreshToken } = data.data;
        await login(
          {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          },
          accessToken,
          refreshToken,
        );
      } else {
        setError("Login failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.screenBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="displaySmall" style={[styles.title, { color: colors.brandPrimary }]}>
            ExTracker
          </Text>
          <Text variant="bodyLarge" style={[styles.subtitle, { color: colors.textTertiary }]}>
            Sign in to your account
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={[styles.input, { backgroundColor: colors.inputBackground }]}
            outlineColor={colors.inputBorder}
            activeOutlineColor={colors.brandPrimary}
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            style={[styles.input, { backgroundColor: colors.inputBackground }]}
            outlineColor={colors.inputBorder}
            activeOutlineColor={colors.brandPrimary}
            right={
              <TextInput.Icon
                icon={showPassword ? "eye-off" : "eye"}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />

          {error ? (
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            buttonColor={colors.brandPrimary}
          >
            Sign In
          </Button>

          <Button
            mode="outlined"
            disabled
            style={[styles.googleButton, { borderColor: colors.border }]}
            icon="google"
          >
            Continue with Google
          </Button>

          <View style={styles.footer}>
            <Text variant="bodyMedium" style={[styles.footerText, { color: colors.textTertiary }]}>
              Don't have an account?{" "}
            </Text>
            <Link href="/(auth)/register" asChild>
              <Text variant="bodyMedium" style={[styles.link, { color: colors.brandPrimary }]}>
                Sign Up
              </Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {},
  form: {
    gap: 4,
  },
  input: {
    marginBottom: 8,
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
  },
  googleButton: {
    marginTop: 12,
    paddingVertical: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  footerText: {},
  link: {
    fontWeight: "600",
  },
});
