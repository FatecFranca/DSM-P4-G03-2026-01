import {
  StartAlertRequestSchema,
  StartAlertResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppButton } from "../components/AppButton";
import { GlassCard } from "../components/GlassCard";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";
import { Colors, Spacing, Typography } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "Sos">;

export function SosScreen({ navigation }: Props) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAlert = async (mode: "visible" | "discreet") => {
    setError(null);
    const parsed = StartAlertRequestSchema.safeParse({ mode });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetchJson<unknown>("/alerts/start", {
        method: "POST",
        body: JSON.stringify(parsed.data),
        accessToken: getAccessToken(),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      const body = StartAlertResponseSchema.safeParse(result.data);
      if (!body.success) {
        setError("Resposta inválida da API");
        return;
      }
      navigation.replace("ActiveAlert", { alertId: body.data.alert.id });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.icon}>🚨</Text>
        <Text style={styles.title}>Iniciar Alerta</Text>
        <Text style={styles.subtitle}>
          Escolha o modo do alerta. Seus contatos de emergência serão
          notificados imediatamente.
        </Text>
      </View>

      {/* Mode Cards */}
      <View style={styles.cards}>
        <GlassCard variant="danger" style={styles.modeCard}>
          <Text style={styles.modeIcon}>📢</Text>
          <Text style={styles.modeTitle}>Modo Visível</Text>
          <Text style={styles.modeDesc}>
            Alarme sonoro e visual para todos os seus contatos. Ideal quando
            você precisa de atenção máxima.
          </Text>
          <AppButton
            title="Ativar visível"
            variant="danger"
            onPress={() => void startAlert("visible")}
            loading={loading}
            style={{ marginTop: Spacing.md }}
          />
        </GlassCard>

        <GlassCard style={styles.modeCard}>
          <Text style={styles.modeIcon}>🤫</Text>
          <Text style={styles.modeTitle}>Modo Discreto</Text>
          <Text style={styles.modeDesc}>
            Notificação silenciosa para seus contatos. Ideal quando você não
            pode chamar atenção do agressor.
          </Text>
          <AppButton
            title="Ativar discreto"
            variant="outline"
            onPress={() => void startAlert("discreet")}
            loading={loading}
            style={{ marginTop: Spacing.md }}
          />
        </GlassCard>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xl,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: Spacing.sm,
    maxWidth: 280,
  },
  cards: {
    gap: Spacing.lg,
  },
  modeCard: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  modeIcon: {
    fontSize: 36,
  },
  modeTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  modeDesc: {
    ...Typography.small,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
});
