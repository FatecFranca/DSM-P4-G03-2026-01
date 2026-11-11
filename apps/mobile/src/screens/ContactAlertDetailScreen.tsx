import { AckAlertResponseSchema } from "@protecther/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetchJson } from "../api/client";
import { ContactAlertAudioPanel } from "../audio/ContactAlertAudioPanel";
import { useAuth } from "../auth/AuthContext";
import { formatApiError } from "../lib/apiError";
import { AlertLocationMap } from "../location/AlertLocationMap";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "ContactAlertDetail">;

export function ContactAlertDetailScreen({ route }: Props) {
  const { alertId, ownerName, startedAt } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = height < 700 || width < 360;
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const { getAccessToken } = useAuth();
  const [mapTouching, setMapTouching] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const ackAttempted = useRef(false);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  // Ao abrir o alerta (pela notificação ou pelo "Ver localização em tempo
  // real"), confirma automaticamente o recebimento. O endpoint é idempotente:
  // chamadas repetidas retornam o mesmo `acknowledgedAt`.
  useEffect(() => {
    if (ackAttempted.current) return;
    ackAttempted.current = true;

    void (async () => {
      try {
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
          setAckError("Resposta inválida da API");
          return;
        }
        setConfirmedAt(parsed.data.acknowledgedAt);
      } catch {
        setAckError("Não foi possível confirmar o recebimento");
      }
    })();
  }, [alertId, getAccessToken]);

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={["rgba(255,255,255,0.2)", "rgba(199,22,87,0.2)"]}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.scroll}
        scrollEnabled={!mapTouching}
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
        <Text
          style={[styles.pageTitle, isSmallScreen && styles.pageTitleSmall]}
        >
          Localização em tempo real
        </Text>
        <Text style={styles.pageSubtitle}>Titular: {ownerName}</Text>
        <View style={styles.alertMetaCard}>
          <Text style={styles.alertMetaText}>
            Alerta desde {formatDateTime(startedAt)}
          </Text>
        </View>

        <AlertLocationMap
          alertId={alertId}
          startedAt={startedAt}
          onMapTouchChange={setMapTouching}
        />

        <ContactAlertAudioPanel alertId={alertId} />

        {confirmedAt ? (
          <View style={styles.ackConfirmed}>
            <Text style={styles.ackConfirmedTitle}>Recebimento confirmado</Text>
            <Text style={styles.ackConfirmedText}>
              Confirmado em {formatDateTime(confirmedAt)}
            </Text>
          </View>
        ) : null}

        {ackError ? <Text style={styles.ackError}>{ackError}</Text> : null}
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
  ackConfirmed: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    backgroundColor: "rgba(255,208,225,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ackConfirmedTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#55383E",
    textAlign: "center",
  },
  ackConfirmedText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#55383E",
    textAlign: "center",
  },
  ackError: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#B12E58",
    textAlign: "center",
  },
});
