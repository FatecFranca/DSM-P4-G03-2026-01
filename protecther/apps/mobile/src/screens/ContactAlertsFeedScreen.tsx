import { ContactsAlertFeedResponseSchema } from "@protecther/contracts";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GlassCard } from "../components/GlassCard";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { AppButton } from "../components/AppButton";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { Colors, Typography, Spacing, Radius, Shadow } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "ContactAlertsFeed">;

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

  return (
    <Animated.View style={[styles.pulseDot, { opacity: anim }]} />
  );
}

export function ContactAlertsFeedScreen({ navigation }: Props) {
  const { getAccessToken } = useAuth();
  const [items, setItems] = useState<
    {
      ownerName: string;
      alertId: string;
      startedAt: string;
      mode: string;
      risk: string;
    }[]
  >([]);
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
      if (parsed.data.items.length === 0) {
        setItems([]);
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
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const avatarColors = ["#E74C3C", "#6C3CE2", "#F39C12", "#2ECC71", "#3498DB"];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🔔 Alertas</Text>
        <Text style={styles.subtitle}>
          Titulares sob sua proteção com alertas ativos
        </Text>
      </View>

      <AppButton
        title="Atualizar"
        variant="outline"
        onPress={() => void refresh()}
        small
      />

      {/* Content */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>Tudo tranquilo</Text>
          <Text style={styles.emptyDesc}>
            Nenhum alerta ativo das titulares vinculadas a você.
          </Text>
        </View>
      ) : (
        <View style={styles.alertsList}>
          {items.map((row, i) => (
            <Pressable
              key={row.alertId}
              onPress={() =>
                navigation.navigate("ContactAlertDetail", {
                  alertId: row.alertId,
                  ownerName: row.ownerName,
                  startedAt: row.startedAt,
                })
              }
            >
              <GlassCard variant="danger" style={styles.alertCard}>
                <View style={styles.alertCardHeader}>
                  <Avatar
                    name={row.ownerName}
                    color={avatarColors[i % avatarColors.length]}
                    size={48}
                  />
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertName}>{row.ownerName}</Text>
                    <Text style={styles.alertTime}>
                      Desde {formatTime(row.startedAt)}
                    </Text>
                  </View>
                  <PulsingDot />
                </View>

                <View style={styles.alertBadges}>
                  <Badge
                    label={row.mode === "visible" ? "📢 Visível" : "🤫 Discreto"}
                    variant={row.mode === "visible" ? "danger" : "neutral"}
                  />
                  <Badge
                    label={`Risco: ${row.risk === "high" ? "Alto" : "Normal"}`}
                    variant={row.risk === "high" ? "danger" : "warning"}
                  />
                </View>

                <View style={styles.alertAction}>
                  <Text style={styles.alertActionText}>
                    Ver localização em tempo real →
                  </Text>
                </View>
              </GlassCard>
            </Pressable>
          ))}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
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
    gap: Spacing.xs,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: "center",
    maxWidth: 260,
  },
  alertsList: {
    gap: Spacing.md,
  },
  alertCard: {
    gap: Spacing.md,
  },
  alertCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  alertInfo: {
    flex: 1,
  },
  alertName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  alertTime: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.danger,
  },
  alertBadges: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  alertAction: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  alertActionText: {
    ...Typography.captionBold,
    color: Colors.danger,
  },
  error: {
    ...Typography.caption,
    color: Colors.textDanger,
    textAlign: "center",
  },
});
