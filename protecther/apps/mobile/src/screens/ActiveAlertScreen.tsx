import {
  ActiveAlertResponseSchema,
  CancelAlertResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
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

export function ActiveAlertScreen({ navigation, route }: Props) {
  const { alertId } = route.params;
  const { getAccessToken } = useAuth();
  const [summary, setSummary] = useState<string>("Carregando…");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bgHint, setBgHint] = useState<string | null>(null);

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
        "Sem permissão “Sempre”. No iOS, escolha “Sempre” em Ajustes > ProtectHer > Localização. No Android, ative localização em segundo plano para o app.",
      );
      return;
    }
    setBgHint(
      "Permissão em segundo plano concedida. A trilha continua com o app minimizado.",
    );
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerta ativo</Text>
      {refreshing ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.mono}>{summary}</Text>
      )}
      <Text style={styles.label}>
        A localização é enviada automaticamente enquanto o alerta estiver ativo
        (primeiro plano com alta frequência; segundo plano quando você permitir
        “Sempre” / localização em background — ver documentação).
      </Text>
      <Button
        title="Permitir localização em segundo plano"
        onPress={() => void requestBackgroundLocation()}
      />
      {bgHint ? <Text style={styles.warn}>{bgHint}</Text> : null}
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
