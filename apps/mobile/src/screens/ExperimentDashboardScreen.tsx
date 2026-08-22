import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type ExperimentSummary,
  clearExperimentEvents,
  readExperimentEvents,
  summarizeExperimentEvents,
} from "../experiments";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Shadow, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "ExperimentDashboard">;

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatAvgTime(avgValueMs: number | null): string {
  if (avgValueMs === null) {
    return "sem conversão ainda";
  }
  return `${(avgValueMs / 1000).toFixed(2)}s em média`;
}

export function ExperimentDashboardScreen(_props: Props) {
  const insets = useSafeAreaInsets();
  const [summaries, setSummaries] = useState<
    readonly ExperimentSummary[] | null
  >(null);

  const load = useCallback(async () => {
    const events = await readExperimentEvents();
    setSummaries(summarizeExperimentEvents(events));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleClear = useCallback(async () => {
    await clearExperimentEvents();
    await load();
  }, [load]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(12, insets.top + 6),
          paddingBottom: Math.max(Spacing.xxxl, insets.bottom + 16),
        },
      ]}
    >
      <Text style={styles.title}>Resultados do teste A/B</Text>
      <Text style={styles.subtitle}>
        Dados coletados neste dispositivo. Use a tela de SOS para gerar eventos.
      </Text>

      {summaries === null ? (
        <ActivityIndicator
          size="large"
          color="#C71657"
          style={styles.loading}
        />
      ) : summaries.length === 0 ? (
        <Text style={styles.empty}>Nenhum evento registrado ainda.</Text>
      ) : (
        summaries.map((experiment) => (
          <View key={experiment.experimentKey} style={styles.card}>
            <Text style={styles.experimentTitle}>
              {experiment.experimentKey}
            </Text>
            {experiment.variants.map((variant) => (
              <View key={variant.variantId} style={styles.variantRow}>
                <Text style={styles.variantName}>{variant.variantId}</Text>
                <Text style={styles.stat}>
                  {variant.exposures} exposições · {variant.conversions}{" "}
                  conversões · {formatPercent(variant.conversionRate)}
                </Text>
                <Text style={styles.stat}>
                  {formatAvgTime(variant.avgValueMs)}
                </Text>
              </View>
            ))}
          </View>
        ))
      )}

      <Pressable
        onPress={() => void handleClear()}
        style={({ pressed }) => [
          styles.clearButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.clearButtonText}>Limpar dados coletados</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#FDF2F6",
  },
  container: {
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 26,
    color: "#55383E",
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: "#55383E",
  },
  loading: {
    marginTop: 24,
  },
  empty: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#55383E",
    textAlign: "center",
    marginTop: 24,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    ...Shadow.sm,
  },
  experimentTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#55383E",
  },
  variantRow: {
    gap: 2,
  },
  variantName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#55383E",
  },
  stat: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#55383E",
  },
  clearButton: {
    marginTop: 4,
    alignSelf: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#C17986",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#C17986",
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
