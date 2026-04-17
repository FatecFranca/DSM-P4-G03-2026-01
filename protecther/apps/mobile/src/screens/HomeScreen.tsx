import { ActiveAlertResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GlassCard } from "../components/GlassCard";
import { AppButton } from "../components/AppButton";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Colors, Typography, Spacing, Radius, Shadow } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { state, signOut, getAccessToken } = useAuth();
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);

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

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state.session;
  const firstName = user.name.split(" ")[0];

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
              onPress={() => navigation.navigate("Sos")}
              style={({ pressed }) => [
                styles.sosButton,
                pressed && { opacity: 0.9, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Text style={styles.sosText}>SOS</Text>
            </Pressable>
          </View>
        </Animated.View>
        <Text style={styles.sosHint}>
          Seus contatos serão notificados instantaneamente
        </Text>
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
