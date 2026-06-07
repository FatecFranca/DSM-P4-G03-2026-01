import { ContactsAlertFeedResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "ContactAlertsFeed">;

type AlertItem = {
  ownerName: string;
  alertId: string;
  startedAt: string;
  mode: string;
  risk: string;
};

function PulsingDot() {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return <Animated.View style={[styles.pulseDot, { opacity: anim }]} />;
}

export function ContactAlertsFeedScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const { getAccessToken } = useAuth();
  const [items, setItems] = useState<AlertItem[]>([]);
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

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
      >
        <Text style={styles.brand}>Protect Her</Text>

        <Text style={[styles.pageTitle, isSmallScreen && styles.pageTitleSmall]}>
          Alertas
        </Text>
        <Text style={styles.subtitle}>
          Titulares sob sua proteção com alertas ativos
        </Text>

        <Pressable
          onPress={() => void refresh()}
          disabled={loading}
          style={({ pressed }) => [
            styles.updateButton,
            (pressed || loading) && styles.buttonPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#DA8295" size="small" />
          ) : (
            <Text style={styles.updateButtonText}>Atualizar</Text>
          )}
        </Pressable>

        {loading && items.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color="#DA8295" size="large" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <Text style={styles.emptyTitle}>Tudo Tranquilo</Text>
            <Text style={styles.emptyDesc}>
              Nenhum alerta ativo das titulares vinculadas a você
            </Text>
          </View>
        ) : (
          <View style={styles.alertsList}>
            {items.map((row) => (
              <Pressable
                key={row.alertId}
                onPress={() =>
                  navigation.navigate("ContactAlertDetail", {
                    alertId: row.alertId,
                    ownerName: row.ownerName,
                    startedAt: row.startedAt,
                  })
                }
                style={({ pressed }) => [
                  styles.alertCard,
                  pressed && styles.buttonPressed,
                ]}
              >
                <View style={styles.alertCardHeader}>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertName}>{row.ownerName}</Text>
                    <Text style={styles.alertTime}>
                      Desde {formatTime(row.startedAt)}
                    </Text>
                    <Text style={styles.alertMeta}>
                      {row.mode === "visible" ? "Modo visível" : "Modo discreto"}
                      {" · "}
                      Risco {row.risk === "high" ? "alto" : "normal"}
                    </Text>
                  </View>
                  <PulsingDot />
                </View>
                <Text style={styles.alertAction}>Ver localização em tempo real</Text>
              </Pressable>
            ))}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
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
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    lineHeight: 22,
    color: "#55383E",
    textAlign: "center",
    alignSelf: "center",
    width: "100%",
  },
  updateButton: {
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#DA8295",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  updateButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
    color: "#DA8295",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    paddingBottom: 48,
    gap: 12,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DA8295",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  checkMark: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 36,
    color: "#FFFFFF",
    lineHeight: 40,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 22,
    color: "#55383E",
    textAlign: "center",
  },
  emptyDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    lineHeight: 22,
    color: "#55383E",
    textAlign: "center",
    maxWidth: 300,
  },
  alertsList: {
    gap: 10,
    marginTop: 8,
  },
  alertCard: {
    backgroundColor: "rgba(255,208,225,0.55)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  alertCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  alertInfo: {
    flex: 1,
    gap: 2,
  },
  alertName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#55383E",
  },
  alertTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#55383E",
  },
  alertMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#7A5A60",
    marginTop: 2,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#C71657",
    marginTop: 6,
  },
  alertAction: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#DA8295",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#B12E58",
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
