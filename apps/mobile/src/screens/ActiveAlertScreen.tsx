import {
  ActiveAlertResponseSchema,
  CancelAlertResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { ACTIVE_ALERT_ID_STORAGE_KEY } from "../location/locationTaskNames";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Shadow, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "ActiveAlert">;

export function ActiveAlertScreen({ navigation, route }: Props) {
  const { alertId } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
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

  // Pulsing indicator animation (smooth)
  const pulseOpacity = useRef(new Animated.Value(0.35)).current;
  const pulseScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.9,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.35,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.06,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 0.92,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseOpacity, pulseScale]);

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
      await AsyncStorage.removeItem(ACTIVE_ALERT_ID_STORAGE_KEY);
      navigation.replace("Home");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPress = () => {
    Alert.alert(
      "Cancelar alerta",
      "Tem certeza que deseja encerrar o alerta?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim, encerrar",
          style: "destructive",
          onPress: () => void cancel(),
        },
      ],
    );
  };

  const elapsed = alertData
    ? Math.round((Date.now() - Date.parse(alertData.startedAt)) / 1000 / 60)
    : 0;

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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Protect Her</Text>
        <Text style={[styles.pageTitle, isSmallScreen && styles.pageTitleSmall]}>
          Alerta ativo
        </Text>

        <View style={styles.pulseSection}>
          <View style={styles.pulseIndicator}>
            <Animated.View
              style={[
                styles.pulseOuter,
                { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ]}
            />
            <View style={styles.pulseDot} />
          </View>
          <Text style={styles.pulseLabel}>ALERTA EM ANDAMENTO</Text>
        </View>

        {refreshing && !alertData ? (
          <View style={styles.infoCard}>
            <ActivityIndicator color="#C71657" />
          </View>
        ) : alertData ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Modo</Text>
              <Text style={styles.infoValue}>
                {alertData.mode === "visible" ? "Visível" : "Discreto"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Risco</Text>
              <Text style={styles.infoValue}>
                {alertData.riskLevel === "high" ? "Alto" : "Normal"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tempo</Text>
              <Text style={styles.infoValue}>{elapsed} min</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.noAlert}>Alerta encerrado ou indisponível.</Text>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.cancelTitle}>Estou segura</Text>
          <Text style={styles.cancelDesc}>
            PIN opcional. Se preenchido, o sistema entende que você está sob
            coação. O alerta encerra para você, mas o risco é elevado no
            sistema.
          </Text>
          <TextInput
            placeholder="PIN de coação (opcional)"
            placeholderTextColor="#8B7378"
            cursorColor="#DA8295"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            style={styles.input}
          />
          <Pressable
            onPress={handleCancelPress}
            disabled={loading}
            style={({ pressed }) => [
              styles.cancelButton,
              (pressed || loading) && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancelar alerta</Text>
            )}
          </Pressable>
        </View>

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
  pulseSection: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.38)",
    minHeight: 82,
  },
  pulseIndicator: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseOuter: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(199,22,87,0.2)",
  },
  pulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#C71657",
  },
  pulseLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#A0224D",
    letterSpacing: 1,
  },
  infoCard: {
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#6A5157",
  },
  infoValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#55383E",
  },
  noAlert: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#6A5157",
    textAlign: "center",
  },
  sectionCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  cancelTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#55383E",
  },
  cancelDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#6A5157",
    lineHeight: 18,
  },
  input: {
    minHeight: 44,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFD0E1",
    color: "#55383E",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  cancelButton: {
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: "#C17986",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 2,
    ...Shadow.sm,
  },
  cancelButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
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
