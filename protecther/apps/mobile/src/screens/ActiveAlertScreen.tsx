import {
  ActiveAlertResponseSchema,
  CancelAlertResponseSchema,
  PostAlertLocationRequestSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { logMobileTelemetry } from "../lib/telemetry";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "ActiveAlert">;

const INTERVAL_CHOICES_MS = [10_000, 15_000, 30_000] as const;

function defaultIntervalMs(): number {
  const extra = Constants.expoConfig?.extra as
    | { locationIntervalMs?: number }
    | undefined;
  const v = extra?.locationIntervalMs;
  return typeof v === "number" && Number.isFinite(v) ? v : 15_000;
}

export function ActiveAlertScreen({ navigation, route }: Props) {
  const { alertId } = route.params;
  const { getAccessToken } = useAuth();
  const [summary, setSummary] = useState<string>("Carregando…");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState(defaultIntervalMs);

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
      setSummary("Nenhum alerta ativo (encerrado ou outro dispositivo).");
      return;
    }
    setSummary(
      `Status: ${active.status}\nModo: ${active.mode}\nRisco: ${active.riskLevel}\nInício: ${active.startedAt}`,
    );
  }, [alertId, getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(true);
      void loadActive().finally(() => setRefreshing(false));
    }, [loadActive]),
  );

  useFocusEffect(
    useCallback(() => {
      let subscription: Location.LocationSubscription | undefined;
      let cancelled = false;

      async function startStream() {
        setLocError(null);
        const activeCheck = await apiFetchJson<unknown>("/alerts/active", {
          method: "GET",
          accessToken: getAccessToken(),
        });
        if (!activeCheck.ok) {
          setLocError(formatApiError(activeCheck.body));
          logMobileTelemetry("location_stream_failed", {
            reason: "active_check_http",
            status: activeCheck.status,
          });
          return;
        }
        const parsedActive = ActiveAlertResponseSchema.safeParse(
          activeCheck.data,
        );
        if (!parsedActive.success || !parsedActive.data.alert) {
          setLocError("Sem alerta ativo para enviar localização.");
          logMobileTelemetry("location_stream_failed", {
            reason: "no_active_alert",
          });
          return;
        }
        if (parsedActive.data.alert.id !== alertId) {
          setLocError("O alerta ativo não corresponde a esta tela.");
          logMobileTelemetry("location_stream_failed", {
            reason: "alert_mismatch",
          });
          return;
        }

        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          setLocError(
            "Permissão de localização negada. Ative nas configurações do sistema para compartilhar posição durante o alerta.",
          );
          logMobileTelemetry("location_stream_failed", {
            reason: "permission_denied",
          });
          return;
        }

        logMobileTelemetry("location_stream_started", { alertId });

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: intervalMs,
            distanceInterval: 5,
          },
          async (loc) => {
            if (cancelled) {
              return;
            }
            const payload = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? undefined,
              speed:
                loc.coords.speed != null &&
                !Number.isNaN(loc.coords.speed) &&
                loc.coords.speed >= 0
                  ? loc.coords.speed
                  : undefined,
              heading:
                loc.coords.heading != null &&
                !Number.isNaN(loc.coords.heading) &&
                loc.coords.heading >= 0
                  ? loc.coords.heading
                  : undefined,
              capturedAt: new Date(loc.timestamp).toISOString(),
            };
            const valid = PostAlertLocationRequestSchema.safeParse(payload);
            if (!valid.success) {
              setLocError(valid.error.message);
              logMobileTelemetry("location_stream_failed", {
                reason: "validation",
              });
              return;
            }
            const post = await apiFetchJson<unknown>(
              `/alerts/${encodeURIComponent(alertId)}/location`,
              {
                method: "POST",
                body: JSON.stringify(valid.data),
                accessToken: getAccessToken(),
              },
            );
            if (!post.ok) {
              setLocError(formatApiError(post.body));
              logMobileTelemetry("location_stream_failed", {
                reason: "post_http",
                status: post.status,
              });
              return;
            }
            setLocError(null);
            logMobileTelemetry("location_point_sent", { alertId });
          },
        );
      }

      void startStream();

      return () => {
        cancelled = true;
        subscription?.remove();
      };
    }, [alertId, getAccessToken, intervalMs]),
  );

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerta ativo</Text>
      {refreshing ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.mono}>{summary}</Text>
      )}
      <Text style={styles.label}>Intervalo de envio de localização</Text>
      <View style={styles.row}>
        {INTERVAL_CHOICES_MS.map((ms) => (
          <View key={ms} style={styles.rowItem}>
            <Button
              title={`${ms / 1000}s`}
              onPress={() => setIntervalMs(ms)}
              color={intervalMs === ms ? "#0a6" : "#888"}
            />
          </View>
        ))}
      </View>
      <Text style={styles.label}>
        A posição é enviada em segundo plano enquanto esta tela estiver em foco.
      </Text>
      {locError ? <Text style={styles.warn}>{locError}</Text> : null}
      <Text style={styles.label}>
        PIN opcional (coação): se preenchido, o alerta encerra para você, mas o
        risco é marcado como alto no sistema.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="PIN (opcional)"
        autoCapitalize="none"
        secureTextEntry
        value={pin}
        onChangeText={setPin}
      />
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title="Cancelar alerta" onPress={() => void cancel()} />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 56, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#222" },
  label: { fontSize: 14, color: "#444", marginTop: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rowItem: { minWidth: 72 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: "#c00" },
  warn: { color: "#a60", fontWeight: "600" },
});
