import {
  AckAlertResponseSchema,
  ListAlertLocationsResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppButton } from "../components/AppButton";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { GlassCard } from "../components/GlassCard";
import { formatApiError } from "../lib/apiError";
import { logMobileTelemetry } from "../lib/telemetry";
import type { AppStackParamList } from "../navigation/types";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";

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
  const webViewRef = useRef<WebView>(null);
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const mapInit = useRef(false);

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

  useEffect(() => {
    if (!last) return;
    if (!mapInit.current) {
      mapInit.current = true;
      setMapHtml(generateMapHtml(last.lat, last.lng));
    } else {
      webViewRef.current?.injectJavaScript(
        `moveMarker(${last.lat}, ${last.lng})`,
      );
    }
  }, [last]);

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

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Avatar name={ownerName} size={56} color={Colors.danger} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{ownerName}</Text>
          <Text style={styles.headerSub}>
            Alerta desde {formatDateTime(startedAt)}
          </Text>
        </View>
        <Badge label="Ativo" variant="danger" />
      </View>

      {/* Map via Leaflet WebView */}
      {loading && points.length === 0 ? (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.mapLoading}>Carregando localização…</Text>
        </View>
      ) : mapHtml && last ? (
        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml }}
            style={styles.map}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={["*"]}
          />
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>
              📍 {points.length} ponto{points.length !== 1 ? "s" : ""} ·
              OpenStreetMap
            </Text>
          </View>
        </View>
      ) : null}

      {/* Fallback: text points when no location yet */}
      {!last ? (
        <GlassCard>
          <Text style={styles.pointsTitle}>📍 Pontos de localização</Text>
          <Text style={styles.pointsEmpty}>
            Aguardando pontos de localização…
          </Text>
        </GlassCard>
      ) : null}

      {/* ACK */}
      <GlassCard style={styles.ackCard}>
        <Text style={styles.ackTitle}>
          {ackAt ? "✅ Recebimento confirmado" : "Confirmar recebimento"}
        </Text>
        <Text style={styles.ackDesc}>
          {ackAt
            ? `Confirmado em ${formatDateTime(ackAt)}`
            : "Indique que você recebeu o alerta e está ciente."}
        </Text>
        {!ackAt ? (
          <AppButton
            title="Confirmar (ACK)"
            variant="primary"
            onPress={() => void acknowledge()}
            small
            style={{ marginTop: Spacing.sm }}
          />
        ) : null}
        {ackError ? <Text style={styles.error}>{ackError}</Text> : null}
      </GlassCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function generateMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0}
    html,body,#map{width:100%;height:100%}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    var marker=L.marker([${lat},${lng}]).addTo(map);
    function moveMarker(a,b){marker.setLatLng([a,b])}
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  container: {
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  headerSub: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  mapContainer: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  map: {
    height: Dimensions.get("window").height * 0.8,
  },
  mapOverlay: {
    backgroundColor: Colors.bgSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapOverlayText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  mapLoading: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  pointsTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  pointsEmpty: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  pointRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pointTime: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  pointCoords: {
    fontFamily: "monospace",
    fontSize: 11,
    color: Colors.textMuted,
  },
  ackCard: {
    gap: Spacing.sm,
  },
  ackTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  ackDesc: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});
