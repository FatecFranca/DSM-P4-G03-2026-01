import {
  AuthSuccessResponseSchema,
  RegisterRequestSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
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
import { Colors, Typography, Spacing } from "../theme";
import type { AuthStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    const parsed = RegisterRequestSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetchJson<unknown>("/auth/register", {
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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>🛡️</Text>
          </View>
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.subtitle}>
            Cadastre-se e proteja quem você ama
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <AppInput
            label="Nome"
            placeholder="Seu nome completo"
            value={name}
            onChangeText={setName}
          />

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
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AppButton
            title="Registrar"
            onPress={() => void onSubmit()}
            loading={loading}
            style={{ marginTop: Spacing.sm }}
          />

          <AppButton
            title="Já tenho conta"
            onPress={() => navigation.navigate("Login")}
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
  header: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.bgGlass,
    borderWidth: 2,
    borderColor: Colors.borderActive,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoIcon: {
    fontSize: 32,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.lg,
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
  },
});
