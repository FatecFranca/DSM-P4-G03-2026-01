import { useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Radius, Shadow } from "../theme";
import { type SosAudioState, describeSosAudioStatus } from "./sosAudio";
import {
  getSosAudioState,
  sendSosAudioCommand,
  subscribeSosAudioState,
} from "./sosAudioStore";

export function useSosAudioState(): SosAudioState {
  return useSyncExternalStore(
    subscribeSosAudioState,
    getSosAudioState,
    getSosAudioState,
  );
}

/** Cartão "Áudio do alerta" na tela do alerta ativo (dona do alerta). */
export function SosAudioStatusCard({ alertId }: { alertId: string }) {
  const audio = useSosAudioState();
  const view: SosAudioState =
    audio.alertId === alertId || audio.alertId === null
      ? audio
      : { ...audio, status: "idle" };
  const text = describeSosAudioStatus(view);

  let action: { label: string; onPress: () => void } | null = null;
  if (view.status === "recording" || view.status === "starting") {
    action = {
      label: "Pausar áudio",
      onPress: () => sendSosAudioCommand({ type: "pause", alertId }),
    };
  } else if (view.status === "paused_by_user") {
    action = {
      label: "Retomar áudio",
      onPress: () => sendSosAudioCommand({ type: "resume", alertId }),
    };
  } else if (view.status === "needs_permission") {
    action = {
      label: "Permitir microfone",
      onPress: () => sendSosAudioCommand({ type: "open_mic_explanation" }),
    };
  }

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.header}>
        {view.status === "recording" ? (
          <View style={styles.recDot} accessibilityLabel="Gravando" />
        ) : view.status === "starting" ? (
          <ActivityIndicator size="small" color="#C71657" />
        ) : null}
        <Text style={styles.title}>{text.title}</Text>
      </View>
      <Text
        style={[styles.detail, text.tone === "warning" && styles.detailWarning]}
      >
        {text.detail}
      </Text>
      {view.chunksRecorded > 0 ? (
        <Text style={styles.meta}>
          {view.chunksRecorded}{" "}
          {view.chunksRecorded === 1 ? "trecho gravado" : "trechos gravados"}
          {view.pendingUploads === 0 ? " · todos enviados" : ""}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E2A2AE",
    backgroundColor: "rgba(255,208,225,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#C71657",
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#55383E",
    flexShrink: 1,
  },
  detail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: "#6A5157",
  },
  detailWarning: {
    color: "#A0224D",
  },
  meta: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#6A5157",
  },
  button: {
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
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.85,
  },
});
