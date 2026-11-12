import {
  ActiveAlertResponseSchema,
  StartAlertRequestSchema,
  StartAlertResponseSchema,
} from "@protecther/contracts";
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
  Vibration,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { publishActiveAlert } from "../alerts/activeAlertBus";
import { apiFetchJson } from "../api/client";
import { readMicPermission } from "../audio/micPermission";
import { onSosAudioCommand, sendSosAudioCommand } from "../audio/sosAudioStore";
import { useAuth } from "../auth/AuthContext";
import { useEspButtonBleState } from "../ble/EspButtonBleContext";
import { formatApiError, formatValidationError } from "../lib/apiError";
import { requestLocationSyncNow } from "../location/locationSyncTrigger";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Shadow, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { state, signOut, getAccessToken } = useAuth();
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sosError, setSosError] = useState<string | null>(null);
  const [micGranted, setMicGranted] = useState(true);
  const isSmallScreen = height < 700 || width < 360;
  const isVeryNarrow = width < 350;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const outerSize = isSmallScreen ? 178 : 198;
  const innerSize = isSmallScreen ? 148 : 168;

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const refreshActive = useCallback(async () => {
    const token = getAccessToken();
    const result = await apiFetchJson<unknown>("/alerts/active", {
      method: "GET",
      accessToken: token,
    });
    if (!result.ok) {
      setActiveAlertId(null);
      return;
    }
    const parsed = ActiveAlertResponseSchema.safeParse(result.data);
    if (!parsed.success || !parsed.data.alert) {
      setActiveAlertId(null);
      return;
    }
    setActiveAlertId(parsed.data.alert.id);
  }, [getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshActive();
      void readMicPermission().then((p) => setMicGranted(p.granted));
    }, [refreshActive]),
  );

  // A explicação do microfone envia "kick" ao fechar: atualiza o link.
  useEffect(
    () =>
      onSosAudioCommand((command) => {
        if (command.type === "kick") {
          void readMicPermission().then((p) => setMicGranted(p.granted));
        }
      }),
    [],
  );

  const startAlert = useCallback(async () => {
    if (activeAlertId) {
      navigation.navigate("ActiveAlert", { alertId: activeAlertId });
      return;
    }
    setSosError(null);
    const parsed = StartAlertRequestSchema.safeParse({ mode: "visible" });
    if (!parsed.success) {
      setSosError(formatValidationError(parsed.error));
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
        setSosError(formatApiError(result.body));
        return;
      }
      const body = StartAlertResponseSchema.safeParse(result.data);
      if (!body.success) {
        setSosError("Resposta inválida da API");
        return;
      }
      Vibration.vibrate([0, 300, 100, 300, 100, 300]);
      // Liga o áudio do SOS já (com o app aberto o sistema permite o microfone).
      publishActiveAlert(body.data.alert.id);
      // Inicia o streaming de GPS na hora, sem esperar o polling de ~25s.
      requestLocationSyncNow();
      navigation.navigate("ActiveAlert", { alertId: body.data.alert.id });
    } finally {
      setLoading(false);
    }
  }, [activeAlertId, getAccessToken, navigation]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state.session;
  const firstName = user.name.split(" ")[0];

  const {
    status: bleStatus,
    isConnected: bleConnected,
    error: bleError,
  } = useEspButtonBleState();

  const bleStatusText =
    bleError ?? (bleConnected ? "Dispositivo conectado" : bleStatus);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["rgba(255,255,255,0.2)", "rgba(199,22,87,0.2)"]}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(12, insets.top + 6),
            paddingBottom: Math.max(Spacing.xl, insets.bottom + 14),
            width: "100%",
            maxWidth: contentMaxWidth,
            alignSelf: "center",
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerTop}>
          <Text style={styles.brand}>Protect Her</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate("Appearance")}
              style={styles.logoutBtn}
            >
              <Text style={styles.logoutText}>Aparência</Text>
            </Pressable>
            <Pressable onPress={() => void signOut()} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Sair</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.userBlock}>
          <Text style={styles.greeting}>Olá, {firstName}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        {activeAlertId ? (
          <Pressable
            onPress={() =>
              navigation.navigate("ActiveAlert", { alertId: activeAlertId })
            }
            style={styles.activeAlertBanner}
          >
            <Text style={styles.activeAlertText}>
              Alerta ativo em andamento
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.sosSection}>
          <Text style={styles.sosLabel}>
            Emergência? Aperte o colar 1 vez{"\n"}ou pressione o botão
          </Text>

          <Animated.View
            style={[
              styles.sosOuter,
              {
                width: outerSize,
                height: outerSize,
                borderRadius: outerSize / 2,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={["#FFC3D5", "#C71657"]}
              style={styles.sosGradientRing}
            >
              <Pressable
                onPress={() => void startAlert()}
                disabled={loading}
                style={({ pressed }) => [
                  styles.sosButton,
                  {
                    width: innerSize,
                    height: innerSize,
                    borderRadius: innerSize / 2,
                  },
                  (pressed || loading) && styles.buttonPressed,
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="large" color="#FFFFFF" />
                ) : (
                  <Text style={styles.sosText}>S O S</Text>
                )}
              </Pressable>
            </LinearGradient>
          </Animated.View>

          <Text style={styles.sosHint}>
            Seus contatos serão notificados{"\n"}instantaneamente
          </Text>

          {sosError ? <Text style={styles.sosError}>{sosError}</Text> : null}

          <Pressable
            onPress={() => navigation.navigate("QuickSos")}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.quickSosLink}>
              Configurar SOS rápido (sem abrir o app) ›
            </Text>
          </Pressable>

          {micGranted ? null : (
            <Pressable
              onPress={() =>
                sendSosAudioCommand({ type: "open_mic_explanation" })
              }
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.quickSosLink}>
                Ativar áudio no SOS (microfone) ›
              </Text>
            </Pressable>
          )}

          <View style={styles.bleStatusCard}>
            <Text
              style={[
                styles.bleStatusText,
                bleError ? styles.bleStatusError : undefined,
              ]}
            >
              {bleStatusText}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.quickActions,
            isVeryNarrow ? styles.quickActionsNarrow : undefined,
          ]}
        >
          <Pressable
            style={[
              styles.actionCard,
              isVeryNarrow ? styles.actionCardNarrow : undefined,
            ]}
            onPress={() => navigation.navigate("Contacts")}
          >
            <Text style={styles.actionLabel}>Contatos</Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionCard,
              isVeryNarrow ? styles.actionCardNarrow : undefined,
            ]}
            onPress={() => navigation.navigate("ContactAlertsFeed")}
          >
            <Text style={styles.actionLabel}>Alertas</Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionCard,
              isVeryNarrow ? styles.actionCardNarrow : undefined,
            ]}
            onPress={() => navigation.navigate("DeviceManagement")}
          >
            <Text style={styles.actionLabel}>Minhas{"\n"}joias</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDF2F6",
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brand: {
    fontFamily: "Italianno_400Regular",
    fontSize: 36,
    color: "#DA8295",
    lineHeight: 40,
  },
  userBlock: {
    marginTop: 2,
    marginBottom: 8,
    gap: 0,
  },
  greeting: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 24,
    lineHeight: 26,
    color: "#55383E",
    includeFontPadding: false,
  },
  email: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 16,
    color: "#55383E",
    marginTop: -4,
    includeFontPadding: false,
  },
  logoutBtn: {
    minWidth: 36,
    minHeight: 24,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#C2828F",
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.sm,
  },
  logoutText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#FFFFFF",
  },
  activeAlertBanner: {
    marginTop: 6,
    marginBottom: 10,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(199,22,87,0.14)",
    borderWidth: 1,
    borderColor: "#C71657",
  },
  activeAlertText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#7D1F44",
    textAlign: "center",
  },
  sosSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingTop: 10,
  },
  sosLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: "#55383E",
    textAlign: "center",
    lineHeight: 25,
    marginBottom: 2,
  },
  sosOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  sosGradientRing: {
    flex: 1,
    width: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  sosButton: {
    backgroundColor: "#C72A67",
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.glow("#C71657", 0.35),
  },
  sosText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 46,
    color: "#FFFFFF",
    letterSpacing: 3,
  },
  sosHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 18,
    color: "#55383E",
    textAlign: "center",
    lineHeight: 24,
  },
  bleStatusCard: {
    width: "100%",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#D9A2AE",
    backgroundColor: "rgba(255,221,225,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  bleStatusText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    color: "#55383E",
  },
  bleStatusError: {
    color: "#B12E58",
  },
  sosError: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#B12E58",
    textAlign: "center",
    marginTop: -6,
  },
  quickSosLink: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#B12E58",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    marginBottom: 6,
  },
  quickActionsNarrow: {
    flexWrap: "wrap",
  },
  actionCard: {
    flex: 1,
    minHeight: 66,
    backgroundColor: "#C88B95",
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.md,
  },
  actionCardNarrow: {
    minWidth: "48%",
  },
  actionLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 17,
    color: "#FFFFFF",
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
