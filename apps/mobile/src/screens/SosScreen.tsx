import {
  StartAlertRequestSchema,
  StartAlertResponseSchema,
} from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Shadow, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "Sos">;

export function SosScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    Notifications.setNotificationChannelAsync("alert", {
      name: "Alertas de Perigo",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 300, 100, 300, 100, 300],
      enableVibrate: true,
    }).catch(() => {});
  }, []);

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
      Vibration.vibrate([0, 300, 100, 300, 100, 300]);
      try {
        const perms = await Notifications.getPermissionsAsync();
        if (!perms.granted) {
          await Notifications.requestPermissionsAsync();
        }
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "🚨 Alerta de Perigo Ativo",
            body: `Alerta ${mode === "visible" ? "visível" : "discreto"} iniciado. Seus contatos estão sendo notificados.`,
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: null,
        });
      } catch {
        /* notificação pode falhar em ambiente sem suporte — não bloquear */
      }
      navigation.replace("ActiveAlert", { alertId: body.data.alert.id });
    } finally {
      setLoading(false);
    }
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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Protect Her</Text>

        <View style={styles.headerSection}>
          <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
            Iniciar Alerta
          </Text>
          <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
            Escolha o modo do alerta. Seus contatos{"\n"}de emergencia serao
            notificados{"\n"}imediatamente
          </Text>
        </View>

        <View style={styles.cards}>
          <View style={styles.modeCard}>
            <Text style={[styles.modeTitle, isSmallScreen && styles.modeTitleSmall]}>
              Modo Visivel
            </Text>
            <Text style={styles.modeDesc}>
              Alarme sonoro e visual para todos os seus contatos. Ideal quando
              voce precisa chamar atencao maxima.
            </Text>
            <Pressable
              onPress={() => void startAlert("visible")}
              disabled={loading}
              style={({ pressed }) => [
                styles.modeButton,
                (pressed || loading) && styles.buttonPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modeButtonText}>Ativar visivel</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.modeCard}>
            <Text style={[styles.modeTitle, isSmallScreen && styles.modeTitleSmall]}>
              Modo Discreto
            </Text>
            <Text style={styles.modeDesc}>
              Notificacao silenciosa para seus contatos. Ideal quando voce nao
              pode chamar atencao do agressor.
            </Text>
            <Pressable
              onPress={() => void startAlert("discreet")}
              disabled={loading}
              style={({ pressed }) => [
                styles.modeButton,
                (pressed || loading) && styles.buttonPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modeButtonText}>Ativar discreto</Text>
              )}
            </Pressable>
          </View>
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
  headerSection: {
    alignItems: "center",
    marginTop: 2,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 38,
    lineHeight: 44,
    color: "#55383E",
    textAlign: "center",
  },
  titleSmall: {
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 19,
    color: "#55383E",
    textAlign: "center",
    marginTop: 2,
  },
  subtitleSmall: {
    fontSize: 13,
    lineHeight: 18,
  },
  cards: {
    gap: 14,
    marginTop: 10,
  },
  modeCard: {
    alignItems: "center",
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  modeTitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 30,
    lineHeight: 36,
    color: "#55383E",
    textAlign: "center",
  },
  modeTitleSmall: {
    fontSize: 24,
    lineHeight: 30,
  },
  modeDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 17,
    color: "#55383E",
    textAlign: "center",
    maxWidth: 310,
  },
  modeButton: {
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: "#C17986",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginTop: 2,
    ...Shadow.sm,
  },
  modeButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#B12E58",
    textAlign: "center",
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});