import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Radius } from "../theme";
import { isSiriRehearsalSuccess } from "./quickSos";
import {
  getQuickSosSettings,
  onQuickSosTrigger,
  updateQuickSosSettings,
} from "./quickSosNative";

const DONE_KEY = "quickSos.siriRehearsalDone";

type Phase = "idle" | "waiting" | "done";

type Props = {
  /** Frase que a usuária deve falar, já com o nome do app. */
  phrase: string;
  /** Avisa a tela para recarregar as configurações (o ensaio liga/desliga o modo teste). */
  onSettingsChanged: () => void;
};

/**
 * Ensaio guiado da Siri. Na primeira vez que alguém usa uma frase do app, o iOS pergunta se
 * pode ativar os atalhos — e não existe API para o app ativar isso sozinho. O ensaio faz essa
 * primeira vez acontecer agora, em modo teste (nenhum alerta sai), em vez de numa emergência.
 */
export function SiriRehearsalCard({ phrase, onSettingsChanged }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Modo teste que estava antes do ensaio, para devolver ao terminar/cancelar.
  const previousTestMode = useRef<boolean | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(DONE_KEY)
      .then((value) => {
        if (value === "1") {
          setPhase((current) => (current === "idle" ? "done" : current));
        }
      })
      .catch(() => undefined);
  }, []);

  const restoreTestMode = useCallback(async () => {
    const previous = previousTestMode.current;
    previousTestMode.current = null;
    if (previous === null) {
      return;
    }
    await updateQuickSosSettings({ testMode: previous }).catch(() => undefined);
    onSettingsChanged();
  }, [onSettingsChanged]);

  // Saiu da tela no meio do ensaio: o modo teste não pode ficar ligado sem ela saber.
  useEffect(() => {
    return () => {
      const previous = previousTestMode.current;
      if (previous !== null) {
        previousTestMode.current = null;
        void updateQuickSosSettings({ testMode: previous }).catch(
          () => undefined,
        );
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "waiting") {
      return;
    }
    return onQuickSosTrigger((result) => {
      if (!isSiriRehearsalSuccess(result)) {
        return;
      }
      setPhase("done");
      void AsyncStorage.setItem(DONE_KEY, "1").catch(() => undefined);
      void restoreTestMode();
    });
  }, [phase, restoreTestMode]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const current = await getQuickSosSettings();
      previousTestMode.current = current.testMode;
      const next = await updateQuickSosSettings({ testMode: true });
      if (!next.testMode) {
        throw new Error("modo teste não ligou");
      }
      onSettingsChanged();
      setPhase("waiting");
    } catch {
      previousTestMode.current = null;
      setError("Não foi possível começar o ensaio. Tente de novo.");
    }
  }, [onSettingsChanged]);

  const cancel = useCallback(() => {
    setPhase("idle");
    void restoreTestMode();
  }, [restoreTestMode]);

  return (
    <View style={styles.card}>
      <Text style={styles.badge}>Faça uma vez</Text>
      <Text style={styles.title}>Ativar a Siri para este app</Text>
      {phase === "idle" ? (
        <>
          <Text style={styles.desc}>
            Na primeira vez que você usa uma frase, a Siri pergunta se pode
            ativar os atalhos deste app. Faça isso agora, com calma: o ensaio
            não envia alerta nenhum.
          </Text>
          <Pressable
            onPress={() => void start()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Começar ensaio</Text>
          </Pressable>
        </>
      ) : null}
      {phase === "waiting" ? (
        <>
          <Text style={styles.desc}>Agora diga em voz alta:</Text>
          <Text style={styles.phrase}>“E aí, Siri, {phrase}”</Text>
          <Text style={styles.desc}>
            Se a Siri perguntar se pode ativar os atalhos, toque em “Ativar”.
            Esta tela avisa quando der certo.
          </Text>
          <Pressable
            onPress={cancel}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Cancelar ensaio</Text>
          </Pressable>
        </>
      ) : null}
      {phase === "done" ? (
        <>
          <Text style={styles.success}>
            ✓ Siri ativada. A partir de agora a frase envia o alerta direto.
          </Text>
          <Pressable
            onPress={() => void start()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Ensaiar de novo</Text>
          </Pressable>
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,221,225,0.6)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    padding: 14,
    gap: 6,
  },
  badge: {
    alignSelf: "flex-start",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
    backgroundColor: "#B12E58",
    borderRadius: Radius.md,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#55383E",
  },
  desc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: "#55383E",
  },
  phrase: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    lineHeight: 23,
    color: "#B12E58",
  },
  success: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: "#2F6B3F",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#B12E58",
  },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: "#B12E58",
  },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  secondaryButton: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#B12E58",
  },
  secondaryButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#B12E58",
  },
  pressed: {
    opacity: 0.7,
  },
});
