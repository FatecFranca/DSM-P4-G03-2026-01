import { ContactsAlertFeedResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "ContactAlertsFeed">;

export function ContactAlertsFeedScreen({ navigation }: Props) {
  const { getAccessToken } = useAuth();
  const [items, setItems] = useState<
    {
      ownerName: string;
      alertId: string;
      startedAt: string;
      mode: string;
      risk: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetchJson<unknown>("/alerts/contacts-feed", {
        method: "GET",
        accessToken: getAccessToken(),
      });
      if (!result.ok) {
        setError(formatApiError(result.body));
        return;
      }
      const parsed = ContactsAlertFeedResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setError("Resposta inválida da API");
        return;
      }
      if (parsed.data.items.length === 0) {
        setItems([]);
        return;
      }
      setItems(
        parsed.data.items.map((item) => ({
          ownerName: item.owner.name,
          alertId: item.alert.id,
          startedAt: item.alert.startedAt,
          mode: item.alert.mode,
          risk: item.alert.riskLevel,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Alertas (contato)</Text>
      <Text style={styles.sub}>
        Titulares com vínculo ativo e alerta em curso aparecem aqui. Toque para
        ver mapa/lista e enviar confirmação (ACK).
      </Text>
      <Button title="Atualizar" onPress={() => void refresh()} />
      {loading ? (
        <ActivityIndicator />
      ) : items.length === 0 ? (
        <Text style={styles.muted}>
          Nenhum alerta ativo das titulares vinculadas.
        </Text>
      ) : (
        items.map((row) => (
          <Pressable
            key={row.alertId}
            style={styles.card}
            onPress={() =>
              navigation.navigate("ContactAlertDetail", {
                alertId: row.alertId,
                ownerName: row.ownerName,
                startedAt: row.startedAt,
              })
            }
          >
            <Text style={styles.cardTitle}>{row.ownerName}</Text>
            <Text style={styles.cardMeta}>
              modo {row.mode} · risco {row.risk}
            </Text>
            <Text style={styles.cardMeta}>desde {row.startedAt}</Text>
            <Text style={styles.cardHint}>Abrir localização →</Text>
          </Pressable>
        ))
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 15, color: "#444" },
  muted: { fontSize: 15, color: "#666" },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  cardMeta: { fontSize: 13, color: "#444" },
  cardHint: { fontSize: 13, color: "#0a6", marginTop: 6 },
  error: { color: "#c00" },
});
