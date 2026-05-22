import {
  ActiveAlertResponseSchema,
  CancelAlertResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { Badge } from "../components/Badge";
import { GlassCard } from "../components/GlassCard";
import { formatApiError } from "../lib/apiError";
import { logMobileTelemetry } from "../lib/telemetry";
import type { AppStackParamList } from "../navigation/types";
import { Colors, Radius, Spacing, Typography } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "ActiveAlert">;

export function ActiveAlertScreen({ navigation, route }: Props) {
  const { alertId } = route.params;
  const { getAccessToken } = useAuth();
  const [alertData, setAlertData] = useState<{
    status: string;
    mode: string;
    riskLevel: string;
    startedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bgHint, setBgHint] = useState<string | null>(null);

  // Pulsing red ring animation
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const loadActive = useCallback(async () => {
    setError(null);
    const token = getAccessToken();
    const result = await apiFetchJson<unknown>("/alerts/active", {
      method: "GET",
      accessToken: token,
    });
    if (!result.ok) {
      setError(formatApiError(result.body));
      return;
    }
    const parsed = ActiveAlertResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      setError("Resposta inválida da API");
      return;
    }
    const active = parsed.data.alert;
    if (!active || active.id !== alertId) {
      setAlertData(null);
      return;
    }
    setAlertData({
      status: active.status,
      mode: active.mode,
      riskLevel: active.riskLevel,
      startedAt: active.startedAt,
    });
  }, [alertId, getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(true);
      void loadActive().finally(() => setRefreshing(false));
    }, [loadActive]),
  );

  const requestBackgroundLocation = async () => {
    setBgHint(null);
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      setBgHint("Permissão de localização negada.");
      logMobileTelemetry("location_stream_failed", {
        reason: "permission_denied",
      });
      return;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      setBgHint(
        'Sem permissão "Sempre". Ative em Ajustes > ProtectHer > Localização para rastreio em segundo plano.',
      );
      return;
    }
    setBgHint("✅ Localização em segundo plano ativada!");
  };

  const cancel = async () => {
    setError(null);
    setLoading(true);
    try {
      const path = `/alerts/${encodeURIComponent(alertId)}/cancel`;
      const body =
        pin.trim().length > 0
          ? JSON.stringify({ pin: pin.trim() })
          : JSON.stringify({});
      const result = await apiFetchJson<unknown>(path, {
        method: "POST",
        body,
        accessToken: getAccessToken(),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      const parsed = CancelAlertResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setError("Resposta inválida ao cancelar");
        return;
      }
      navigation.replace("Sos");
    } finally {
      setLoading(false);
    }
  };

  const elapsed = alertData
    ? Math.round((Date.now() - Date.parse(alertData.startedAt)) / 1000 / 60)
    : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Pulsing indicator */}
      <View style={styles.pulseSection}>
        <Animated.View style={[styles.pulseOuter, { opacity: pulseAnim }]} />
        <View style={styles.pulseDot} />
        <Text style={styles.pulseLabel}>ALERTA ATIVO</Text>
      </View>

      {/* Alert Info */}
      {refreshing && !alertData ? (
        <ActivityIndicator color={Colors.danger} />
      ) : alertData ? (
        <GlassCard variant="danger" style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Modo</Text>
            <Badge
              label={alertData.mode === "visible" ? "Visível" : "Discreto"}
              variant={alertData.mode === "visible" ? "danger" : "neutral"}
            />
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Risco</Text>
            <Badge
              label={alertData.riskLevel === "high" ? "Alto" : "Normal"}
              variant={alertData.riskLevel === "high" ? "danger" : "safe"}
            />
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tempo</Text>
            <Text style={styles.infoValue}>{elapsed} min</Text>
          </View>
        </GlassCard>
      ) : (
        <Text style={styles.noAlert}>Alerta encerrado ou indisponível.</Text>
      )}

      {/* Location Tracking */}
      <GlassCard>
        <Text style={styles.trackTitle}>📍 Rastreamento de localização</Text>
        <Text style={styles.trackDesc}>
          Sua localização está sendo enviada automaticamente para seus contatos
          de emergência em tempo real.
        </Text>
        <AppButton
          title="Permitir segundo plano"
          variant="outline"
          onPress={() => void requestBackgroundLocation()}
          small
          style={{ marginTop: Spacing.md }}
        />
        {bgHint ? (
          <Text
            style={[
              styles.hint,
              bgHint.startsWith("✅")
                ? { color: Colors.safe }
                : { color: Colors.warning },
            ]}
          >
            {bgHint}
          </Text>
        ) : null}
      </GlassCard>

      {/* Cancel Section */}
      <GlassCard style={styles.cancelSection}>
        <Text style={styles.cancelTitle}>Estou segura</Text>
        <Text style={styles.cancelDesc}>
          PIN opcional — se preenchido, o sistema entende que você está sob
          coação. O alerta encerra para você, mas o risco é elevado no sistema.
        </Text>
        <AppInput
          placeholder="PIN de coação (opcional)"
          value={pin}
          onChangeText={setPin}
          secureTextEntry
        />
        <AppButton
          title="Cancelar alerta"
          variant="safe"
          onPress={() => void cancel()}
          loading={loading}
          style={{ marginTop: Spacing.sm }}
        />
      </GlassCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  container: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  pulseSection: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  pulseOuter: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,71,87,0.15)",
    top: -10,
  },
  pulseDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
  },
  pulseLabel: {
    ...Typography.captionBold,
    color: Colors.danger,
    letterSpacing: 2,
  },
  infoCard: {
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  infoValue: {
    ...Typography.captionBold,
    color: Colors.textPrimary,
  },
  noAlert: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: "center",
  },
  trackTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  trackDesc: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  hint: {
    ...Typography.small,
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
  cancelSection: {
    gap: Spacing.sm,
  },
  cancelTitle: {
    ...Typography.bodyBold,
    color: Colors.safe,
  },
  cancelDesc: {
    ...Typography.small,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
  },
});
