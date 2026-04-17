import {
  AuthSuccessResponseSchema,
  LoginRequestSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { Colors, Typography, Spacing, Radius } from "../theme";
import type { AuthStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetchJson<unknown>("/auth/login", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      const session = AuthSuccessResponseSchema.safeParse(result.data);
      if (!session.success) {
        setError("Resposta inválida da API");
        return;
      }
      await signIn(session.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / Branding */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>🛡️</Text>
          </View>
          <Text style={styles.appName}>ProtectHer</Text>
          <Text style={styles.tagline}>Sua segurança em primeiro lugar</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.title}>Entrar</Text>

          <AppInput
            label="E-mail"
            placeholder="seu@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <AppInput
            label="Senha"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AppButton
            title="Entrar"
            onPress={() => void onSubmit()}
            loading={loading}
            style={{ marginTop: Spacing.sm }}
          />

          <AppButton
            title="Criar conta"
            onPress={() => navigation.navigate("Register")}
            variant="ghost"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bgPrimary },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.bgGlass,
    borderWidth: 2,
    borderColor: Colors.borderActive,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoIcon: {
    fontSize: 40,
  },
  appName: {
    ...Typography.hero,
    color: Colors.textPrimary,
  },
  tagline: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
  },
});
