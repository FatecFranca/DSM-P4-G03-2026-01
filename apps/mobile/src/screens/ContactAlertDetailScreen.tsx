import { ListAlertLocationsResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Shadow, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "ContactAlertDetail">;

export function ContactAlertDetailScreen({ route }: Props) {
  const { alertId, ownerName, startedAt } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const { getAccessToken } = useAuth();
  const [points, setPoints] = useState<
    { id: string; lat: number; lng: number; capturedAt: string }[]
  >([]);
  const sinceRef = useRef<string | null>(null);
  const initialRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapTouching, setMapTouching] = useState(false);
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

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={["rgba(255,255,255,0.2)", "rgba(199,22,87,0.2)"]}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(12, insets.top + 6),
            paddingBottom: Math.max(Spacing.xxxl, insets.bottom + 16),
            width: "100%",
            maxWidth: contentMaxWidth,
            alignSelf: "center",
          },
        ]}
        scrollEnabled={!mapTouching}
      >
        <Text style={styles.brand}>Protect Her</Text>
        <Text style={[styles.pageTitle, isSmallScreen && styles.pageTitleSmall]}>
          Localizacao em tempo real
        </Text>
        <Text style={styles.pageSubtitle}>Titular: {ownerName}</Text>
        <View style={styles.alertMetaCard}>
          <Text style={styles.alertMetaText}>
            Alerta desde {formatDateTime(startedAt)}
          </Text>
        </View>

        {loading && points.length === 0 ? (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator color="#DA8295" size="large" />
            <Text style={styles.mapLoading}>Carregando localizacao...</Text>
          </View>
        ) : mapHtml && last ? (
          <View
            style={styles.mapContainer}
            onTouchStart={() => setMapTouching(true)}
            onTouchEnd={() => setMapTouching(false)}
            onTouchCancel={() => setMapTouching(false)}
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
              style={({ pressed }) => [styles.centerBtn, pressed && styles.pressed]}
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
        ) : null}

        {!last ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>i</Text>
            </View>
            <Text style={styles.pointsTitle}>Aguardando localizacao</Text>
            <Text style={styles.pointsEmpty}>
              Ainda nao recebemos pontos da titular para exibir no mapa.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
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
    function centerMap(){map.setView(marker.getLatLng(),map.getZoom())}
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#FDF2F6",
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: Spacing.lg,
    gap: 14,
    flexGrow: 1,
  },
  brand: {
    fontFamily: "Italianno_400Regular",
    fontSize: 36,
    color: "#DA8295",
    lineHeight: 40,
  },
  pageTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 24,
    lineHeight: 30,
    color: "#55383E",
    marginTop: -4,
    textAlign: "center",
    alignSelf: "center",
    width: "100%",
  },
  pageTitleSmall: {
    fontSize: 21,
    lineHeight: 27,
  },
  pageSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: "#55383E",
    textAlign: "center",
  },
  alertMetaCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,208,225,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertMetaText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#55383E",
    textAlign: "center",
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
