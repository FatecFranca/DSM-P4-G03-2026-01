import { ListAlertLocationsResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { Radius, Shadow, Spacing } from "../theme";
import { generateMapHtml } from "./leafletMap";

const POLL_MS = 5000;

type Props = {
  alertId: string;
  /** Referência temporal usada como `since` inicial (normalmente o início do alerta). */
  startedAt?: string;
  /** Avisa o pai quando o usuário está tocando no mapa (para pausar o scroll externo). */
  onMapTouchChange?: (touching: boolean) => void;
};

type Point = { id: string; lat: number; lng: number; capturedAt: string };

/**
 * Mapa Leaflet (via WebView) que exibe a localização em tempo real de um alerta.
 * Faz polling incremental de `GET /alerts/:id/locations`, centraliza no primeiro
 * ponto recebido e move o marker nos pontos seguintes.
 */
export function AlertLocationMap({ alertId, startedAt, onMapTouchChange }: Props) {
  const { getAccessToken } = useAuth();
  const [points, setPoints] = useState<Point[]>([]);
  const sinceRef = useRef<string | null>(null);
  const initialRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const mapInit = useRef(false);

  const fetchIncremental = useCallback(async () => {
    const token = getAccessToken();
    const path = initialRef.current
      ? `/alerts/${encodeURIComponent(alertId)}/locations`
      : `/alerts/${encodeURIComponent(alertId)}/locations?since=${encodeURIComponent(
          sinceRef.current ?? startedAt ?? "",
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
      sinceRef.current = startedAt ?? null;
    }
  }, [alertId, getAccessToken, startedAt]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchIncremental().finally(() => setLoading(false));
      const timer = setInterval(() => {
        void fetchIncremental();
      }, POLL_MS);
      return () => {
        clearInterval(timer);
      };
    }, [fetchIncremental]),
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

  if (loading && points.length === 0) {
    return (
      <View style={styles.mapPlaceholder}>
        <ActivityIndicator color="#DA8295" size="large" />
        <Text style={styles.mapLoading}>Carregando localização...</Text>
      </View>
    );
  }

  if (!mapHtml || !last) {
    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>i</Text>
        </View>
        <Text style={styles.pointsTitle}>Aguardando localização</Text>
        <Text style={styles.pointsEmpty}>
          Ainda não recebemos pontos de localização para exibir no mapa.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View
        style={styles.mapContainer}
        onTouchStart={() => onMapTouchChange?.(true)}
        onTouchEnd={() => onMapTouchChange?.(false)}
        onTouchCancel={() => onMapTouchChange?.(false)}
      >
        <WebView
          ref={webViewRef}
          source={{ html: mapHtml }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={["*"]}
        />
        <Pressable
          style={({ pressed }) => [
            styles.centerBtn,
            pressed && styles.pressed,
          ]}
          onPress={() => webViewRef.current?.injectJavaScript("centerMap()")}
        >
          <Text style={styles.centerBtnText}>Centralizar</Text>
        </Pressable>
        <View style={styles.mapOverlay}>
          <Text style={styles.mapOverlayText}>
            {points.length} ponto{points.length !== 1 ? "s" : ""} capturado
            {points.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  mapContainer: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E8B8C0",
    ...Shadow.md,
  },
  map: {
    height: Dimensions.get("window").height * 0.62,
  },
  mapOverlay: {
    backgroundColor: "#FFFFFF",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#E8B8C0",
  },
  mapOverlayText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#55383E",
    textAlign: "center",
  },
  centerBtn: {
    position: "absolute",
    bottom: 66,
    right: 12,
    minHeight: 36,
    borderRadius: Radius.full,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DA8295",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    ...Shadow.md,
  },
  centerBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#DA8295",
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: Radius.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8B8C0",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  mapLoading: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#7A5A60",
  },
  emptyCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,208,225,0.35)",
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DA8295",
  },
  emptyIconText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  pointsTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: "#55383E",
    textAlign: "center",
  },
  pointsEmpty: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#55383E",
    textAlign: "center",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#B12E58",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});
