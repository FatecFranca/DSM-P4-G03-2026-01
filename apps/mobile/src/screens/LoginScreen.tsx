import {
  AuthSuccessResponseSchema,
  LoginRequestSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AuthStackParamList } from "../navigation/types";
import { Radius, Spacing } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSmallScreen = height < 700 || width < 360;
  const formMaxWidth = Math.min(420, Math.max(300, width - 40));
  const logoSize = isSmallScreen ? 72 : 84;

  const responsiveStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: Math.max(18, width * 0.06),
          paddingTop: isSmallScreen ? Spacing.xl : Spacing.xxxl,
          paddingBottom: isSmallScreen ? Spacing.xxl : Spacing.xxxl,
        },
        logoSection: {
          marginBottom: isSmallScreen ? 24 : 34,
        },
        logoImage: {
          width: logoSize,
          height: logoSize,
          borderRadius: logoSize / 2,
          marginBottom: isSmallScreen ? 8 : 10,
        },
        appName: {
          fontSize: isSmallScreen ? 42 : 48,
          lineHeight: isSmallScreen ? 46 : 52,
        },
        form: {
          width: "100%",
          maxWidth: formMaxWidth,
          alignSelf: "center",
          gap: isSmallScreen ? 12 : 14,
        },
        input: {
          paddingVertical: isSmallScreen ? 10 : 12,
          minHeight: isSmallScreen ? 42 : 46,
        },
      }),
    [formMaxWidth, isSmallScreen, logoSize, width],
  );

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
        contentContainerStyle={[styles.container, responsiveStyles.container]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.2)", "rgba(199,22,87,0.2)"]}
          style={styles.backgroundGradient}
          pointerEvents="none"
        />

        <View style={[styles.logoSection, responsiveStyles.logoSection]}>
          <Image
            source={require("../../assets/login/Icon.png")}
            style={[styles.logoImage, responsiveStyles.logoImage]}
          />
          <Text style={[styles.appName, responsiveStyles.appName]}>
            ProtectHer
          </Text>
          <Text style={styles.tagline}>Sua segurança em primeiro lugar</Text>
        </View>

        <View style={[styles.form, responsiveStyles.form]}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-mail</Text>
            <TextInput
              style={[styles.input, responsiveStyles.input]}
              placeholder="seu@email.com"
              placeholderTextColor="#8B7378"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              cursorColor="#DA8295"
              selectionColor="#DA8295"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Senha</Text>
            <TextInput
              style={[styles.input, responsiveStyles.input]}
              placeholder="••••••••••"
              placeholderTextColor="#8B7378"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              cursorColor="#DA8295"
              selectionColor="#DA8295"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => void onSubmit()}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || loading) && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Entrar</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Register")}
            style={({ pressed }) => [pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryAction}>Criar Conta</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FDF2F6" },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxxl,
    backgroundColor: "#FDF2F6",
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 34,
  },
  logoImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginBottom: 10,
  },
  appName: {
    fontFamily: "Italianno_400Regular",
    fontSize: 48,
    color: "#DA8295",
    lineHeight: 52,
  },
  tagline: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#55383E",
    marginTop: 2,
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#55383E",
  },
  input: {
    backgroundColor: "#FFD0E1",
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#8B7378",
    borderWidth: 0,
  },
  primaryButton: {
    marginTop: 4,
    minHeight: 46,
    borderRadius: Radius.md,
    backgroundColor: "#D79297",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 20,
    color: "#FFFFFF",
    lineHeight: 28,
  },
  secondaryAction: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    color: "#55383E",
    textAlign: "center",
    marginTop: 2,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#B12E58",
    textAlign: "center",
  },
});
