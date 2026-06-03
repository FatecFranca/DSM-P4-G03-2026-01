import {
  ActiveAlertResponseSchema,
  StartAlertRequestSchema,
  StartAlertResponseSchema,
} from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { GlassCard } from "../components/GlassCard";
import { formatApiError } from "../lib/apiError";
import { useEspButtonBleState } from "../ble/EspButtonBleContext";
import type { AppStackParamList } from "../navigation/types";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { state, signOut, getAccessToken } = useAuth();
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState<string | null>(null);

  // Pulsing animation for the SOS button
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
    }, [refreshActive]),
  );

  const triggerSosAlert = useCallback(async () => {
    if (sosLoading) return;
    setSosError(null);
    const parsed = StartAlertRequestSchema.safeParse({ mode: "visible" });
    if (!parsed.success) return;
    setSosLoading(true);
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
      try {
        const perms = await Notifications.getPermissionsAsync();
        if (!perms.granted) await Notifications.requestPermissionsAsync();
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "🚨 Alerta de Perigo Ativo",
            body: "Alerta visível iniciado. Seus contatos estão sendo notificados.",
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: null,
        });
      } catch {
        /* notificação pode falhar em ambiente sem suporte */
      }
      navigation.navigate("ActiveAlert", { alertId: body.data.alert.id });
    } finally {
      setSosLoading(false);
    }
  }, [sosLoading, getAccessToken, navigation]);

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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {firstName} 👋</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sair</Text>
        </Pressable>
      </View>

      {/* Active Alert Banner */}
      {activeAlertId ? (
        <Pressable
          onPress={() =>
            navigation.navigate("ActiveAlert", { alertId: activeAlertId })
          }
        >
          <GlassCard variant="danger" style={styles.alertBanner}>
            <View style={styles.alertDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitle}>Alerta ativo</Text>
              <Text style={styles.alertBannerSub}>
                Toque para ver detalhes →
              </Text>
            </View>
          </GlassCard>
        </Pressable>
      ) : null}

      {/* SOS Button — center of screen */}
      <View style={styles.sosSection}>
        <Text style={styles.sosLabel}>Emergência? Pressione o botão</Text>
        <Animated.View
          style={[styles.sosOuter, { transform: [{ scale: pulseAnim }] }]}
        >
          <View style={styles.sosGlowRing}>
            <Pressable
              onPress={() => void triggerSosAlert()}
              disabled={sosLoading}
              style={({ pressed }) => [
                styles.sosButton,
                (pressed || sosLoading) && { opacity: 0.8, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Text style={styles.sosText}>{sosLoading ? "..." : "SOS"}</Text>
            </Pressable>
          </View>
        </Animated.View>
        <Text style={styles.sosHint}>
          Seus contatos serão notificados instantaneamente
        </Text>
        {sosError ? (
          <Text style={styles.sosErrorText}>{sosError}</Text>
        ) : null}
        <View style={styles.bleStatusCard}>
          <Text style={styles.bleStatusLabel}>Status BLE do ESP32</Text>
          <Text
            style={[
              styles.bleStatusText,
              bleError ? styles.bleStatusError : null,
            ]}
          >
            {bleError ??
              (bleConnected ? "Conectado e aguardando clique" : bleStatus)}
          </Text>
          {bleConnected ? (
            <Text style={styles.bleStatusHint}>
              O dispositivo está pronto. Pressione o botão físico para testar.
            </Text>
          ) : null}
        </View>
      </View>

      {/* Bottom Quick Actions */}
      <View style={styles.quickActions}>
        <Pressable
          style={styles.actionCard}
          onPress={() => navigation.navigate("Contacts")}
        >
          <Text style={styles.actionIcon}>👥</Text>
          <Text style={styles.actionLabel}>Contatos</Text>
          <Text style={styles.actionSub}>Emergência</Text>
        </Pressable>

        <Pressable
          style={styles.actionCard}
          onPress={() => navigation.navigate("ContactAlertsFeed")}
        >
          <Text style={styles.actionIcon}>🔔</Text>
          <Text style={styles.actionLabel}>Alertas</Text>
          <Text style={styles.actionSub}>Das titulares</Text>
        </Pressable>

        <Pressable
          style={styles.actionCard}
          onPress={() => navigation.navigate("DeviceManagement")}
        >
          <Text style={styles.actionIcon}>📡</Text>
          <Text style={styles.actionLabel}>Dispositivos</Text>
          <Text style={styles.actionSub}>ESP32 BLE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  email: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgGlass,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    ...Typography.captionBold,
    color: Colors.textSecondary,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  alertDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.danger,
  },
  alertBannerTitle: {
    ...Typography.bodyBold,
    color: Colors.danger,
  },
  alertBannerSub: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  sosSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  sosLabel: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  sosOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  sosGlowRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,71,87,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,71,87,0.2)",
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.glow(Colors.danger, 0.35),
  },
  sosButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.glow(Colors.danger, 0.5),
  },
  sosText: {
    ...Typography.hero,
    color: Colors.white,
    fontSize: 42,
    letterSpacing: 4,
  },
  sosHint: {
    ...Typography.small,
    color: Colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
  bleStatusCard: {
    width: "100%",
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bleStatusLabel: {
    ...Typography.captionBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  bleStatusText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  bleStatusHint: {
    ...Typography.small,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  bleStatusError: {
    color: Colors.danger,
  },
  sosErrorText: {
    ...Typography.small,
    color: Colors.danger,
    textAlign: "center",
    maxWidth: 280,
  },
  quickActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  actionLabel: {
    ...Typography.captionBold,
    color: Colors.textPrimary,
  },
  actionSub: {
    ...Typography.small,
    color: Colors.textMuted,
  },
});
