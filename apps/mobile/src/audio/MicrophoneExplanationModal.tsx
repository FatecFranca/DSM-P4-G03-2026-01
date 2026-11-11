import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { Radius, Shadow, Spacing } from "../theme";
import {
  readMicExplanationDismissedAt,
  readMicPermission,
  requestMicPermission,
  saveMicExplanationDismissedAt,
} from "./micPermission";
import { SOS_AUDIO_CHUNK_MS, shouldShowMicExplanation } from "./sosAudio";
import { onSosAudioCommand, sendSosAudioCommand } from "./sosAudioStore";

/** Deixa os pedidos de localização/notificações do login aparecerem primeiro. */
const FIRST_PROMPT_DELAY_MS = 1_500;

/**
 * Explica, antes do pedido do sistema, por que o app quer o microfone. Aparece
 * sozinho uma vez depois do login (e de novo 7 dias após "Agora não") e pode ser
 * aberto pela Home ou pela tela do alerta (`open_mic_explanation`).
 */
export function MicrophoneExplanationModal() {
  const { state } = useAuth();
  const authenticated = state.status === "authenticated";
  const [visible, setVisible] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const openIfNeeded = useCallback(async (force: boolean) => {
    const permission = await readMicPermission();
    setCanAskAgain(permission.canAskAgain);
    if (permission.granted) {
      return;
    }
    if (force) {
      setVisible(true);
      return;
    }
    const dismissedAt = await readMicExplanationDismissedAt();
    if (shouldShowMicExplanation(permission, dismissedAt, Date.now())) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      void openIfNeeded(false);
    }, FIRST_PROMPT_DELAY_MS);
    const unsubscribe = onSosAudioCommand((command) => {
      if (command.type === "open_mic_explanation") {
        void openIfNeeded(true);
      }
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [authenticated, openIfNeeded]);

  const allow = async () => {
    setRequesting(true);
    try {
      await requestMicPermission();
    } finally {
      setRequesting(false);
      setVisible(false);
      // Se houver um alerta ativo, começa a gravar já.
      sendSosAudioCommand({ type: "kick" });
    }
  };

  const notNow = () => {
    setVisible(false);
    void saveMicExplanationDismissedAt(Date.now());
  };

  const seconds = Math.round(SOS_AUDIO_CHUNK_MS / 1000);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={notNow}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title} accessibilityRole="header">
              Áudio durante o SOS
            </Text>
            <Text style={styles.paragraph}>
              Quando você acionar o SOS, o ProtectHer pode gravar o som ao seu
              redor e enviar para seus contatos de segurança um trecho a cada{" "}
              {seconds} segundos.
            </Text>
            <View style={styles.bullets}>
              <Text style={styles.bullet}>
                • Seus contatos entendem o que está acontecendo e conseguem agir
                mais rápido.
              </Text>
              <Text style={styles.bullet}>
                • Os áudios ficam guardados como prova, só para você e seus
                contatos.
              </Text>
              <Text style={styles.bullet}>
                • O microfone só é usado enquanto um alerta está ativo — nunca
                fora dele. Você pode pausar a gravação na tela do alerta.
              </Text>
            </View>
            <Text style={styles.note}>
              {canAskAgain
                ? "Na próxima tela, o sistema vai pedir a permissão do microfone."
                : "A permissão foi negada antes. Toque abaixo para abrir os Ajustes e liberar o microfone."}
            </Text>

            <Pressable
              onPress={() => void allow()}
              disabled={requesting}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primary,
                (pressed || requesting) && styles.pressed,
              ]}
            >
              {requesting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>
                  {canAskAgain ? "Permitir microfone" : "Abrir Ajustes"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={notNow}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryText}>Agora não</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(40,20,28,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    borderRadius: Radius.lg,
    backgroundColor: "#FDF2F6",
    borderWidth: 1,
    borderColor: "#E2A2AE",
    ...Shadow.sm,
  },
  content: {
    padding: Spacing.lg,
    gap: 12,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 20,
    lineHeight: 26,
    color: "#55383E",
  },
  paragraph: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#55383E",
  },
  bullets: {
    gap: 6,
  },
  bullet: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: "#6A5157",
  },
  note: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "#A0224D",
  },
  primary: {
    minHeight: 46,
    borderRadius: Radius.md,
    backgroundColor: "#C72A67",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 4,
  },
  primaryText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  secondary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#6A5157",
  },
  pressed: {
    opacity: 0.85,
  },
});
