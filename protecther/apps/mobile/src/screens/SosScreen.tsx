import {
  StartAlertRequestSchema,
  StartAlertResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";

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
      <Text style={styles.title}>SOS</Text>
      <Text style={styles.sub}>
        Inicie um alerta em modo visível ou discreto. Apenas um alerta ativo por
        vez.
      </Text>
      {loading ? (
        <ActivityIndicator style={styles.spinner} />
      ) : (
        <>
          <Button
            title="Iniciar alerta (visível)"
            onPress={() => void startAlert("visible")}
          />
          <View style={styles.gap} />
          <Button
            title="Modo discreto"
            onPress={() => void startAlert("discreet")}
            color="#555"
          />
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 56, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 15, color: "#444", marginBottom: 16 },
  spinner: { marginVertical: 24 },
  gap: { height: 8 },
  error: { color: "#c00", marginTop: 12 },
});
