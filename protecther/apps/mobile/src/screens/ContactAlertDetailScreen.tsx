import {
  AckAlertResponseSchema,
  ListAlertLocationsResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { logMobileTelemetry } from "../lib/telemetry";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "ContactAlertDetail">;

export function ContactAlertDetailScreen({ route }: Props) {
  const { alertId, ownerName, startedAt } = route.params;
  const { getAccessToken } = useAuth();
  const [points, setPoints] = useState<
    { id: string; lat: number; lng: number; capturedAt: string }[]
  >([]);
  const sinceRef = useRef<string | null>(null);
  const initialRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackAt, setAckAt] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  const fetchIncremental = useCallback(async () => {
    const token = getAccessToken();
    const path = initialRef.current
      ? `/alerts/${encodeURIComponent(alertId)}/locations`
      : `/alerts/${encodeURIComponent(alertId)}/locations?since=${encodeURIComponent(
          sinceRef.current ?? startedAt,
        )}`;
    const result = await apiFetchJson<unknown>(path, {
      method: "GET",
      accessToken: token,
    });
    if (!result.ok) {
      setError(formatApiError(result.body));
      return;
    }
    const parsed = ListAlertLocationsResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      setError("Resposta inválida da API");
      return;
    }
    setError(null);
    if (initialRef.current) {
      initialRef.current = false;
    }
    if (parsed.data.points.length > 0) {
      setPoints((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of parsed.data.points) {
          if (!seen.has(p.id)) {
            merged.push({
              id: p.id,
              lat: p.lat,
              lng: p.lng,
              capturedAt: p.capturedAt,
            });
            seen.add(p.id);
          }
        }
        return merged.sort(
          (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
        );
      });
      const last = parsed.data.points[parsed.data.points.length - 1];
      sinceRef.current = last.capturedAt;
    } else if (sinceRef.current === null) {
      sinceRef.current = startedAt;
    }
  }, [alertId, getAccessToken, startedAt]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchIncremental().finally(() => setLoading(false));
      const timer = setInterval(() => {
        void fetchIncremental();
      }, 5000);
      return () => {
        clearInterval(timer);
      };
    }, [fetchIncremental]),
  );

  const coords = useMemo(
    () => points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [points],
  );

  const last = points.length > 0 ? points[points.length - 1] : null;

  const acknowledge = async () => {
    setAckError(null);
    const result = await apiFetchJson<unknown>(
      `/alerts/${encodeURIComponent(alertId)}/ack`,
      { method: "POST", accessToken: getAccessToken() },
    );
    if (!result.ok) {
      setAckError(formatApiError(result.body));
      return;
    }
    const parsed = AckAlertResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      setAckError("Resposta inválida ao confirmar");
      return;
    }
    setAckAt(parsed.data.acknowledgedAt);
    logMobileTelemetry("alert_acknowledged", { alertId });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{ownerName}</Text>
      <Text style={styles.sub}>Alerta {alertId}</Text>
      {loading && points.length === 0 ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {Platform.OS !== "web" && last ? (
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            region={{
              latitude: last.lat,
              longitude: last.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            {coords.length > 1 ? (
              <Polyline
                coordinates={coords}
                strokeColor="#b00020"
                strokeWidth={3}
              />
            ) : null}
            <Marker
              coordinate={{ latitude: last.lat, longitude: last.lng }}
              title="Última posição"
            />
          </MapView>
        </View>
      ) : null}
      {Platform.OS === "web" || !last ? (
        <Text style={styles.mono}>
          {points.length === 0
            ? "Aguardando pontos de localização…"
            : points
                .slice(-8)
                .map(
                  (p) =>
                    `${p.capturedAt}\n  ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}\n`,
                )
                .join("\n")}
        </Text>
      ) : null}
      <Button
        title="Confirmar recebimento (ACK)"
        onPress={() => void acknowledge()}
      />
      {ackAt ? <Text style={styles.ok}>Confirmado em {ackAt}</Text> : null}
      {ackError ? <Text style={styles.error}>{ackError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48, gap: 12 },
  title: { fontSize: 20, fontWeight: "700" },
  sub: { fontSize: 14, color: "#444" },
  mapWrap: { height: 280, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1 },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#222" },
  error: { color: "#c00" },
  ok: { color: "#060", fontWeight: "600" },
});
