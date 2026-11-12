import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppStackParamList } from "../navigation/types";
import { SiriRehearsalCard } from "../quickSos/SiriRehearsalCard";
import {
  COUNTDOWN_OPTIONS,
  type CountdownSeconds,
  type QuickSosSettings,
  SIRI_APP_NICKNAMES,
  countdownLabel,
  normalizeSettings,
  siriPhrases,
} from "../quickSos/quickSos";
import {
  getQuickSosCapabilities,
  getQuickSosSettings,
  isIgnoringBatteryOptimizations,
  isQuickSosAvailable,
  openBatterySettings,
  requestAddQuickSosTile,
  triggerQuickSosNow,
  updateQuickSosSettings,
} from "../quickSos/quickSosNative";
import { Radius, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "QuickSos">;

const APP_NAME = Constants.expoConfig?.name ?? "ProtectHer";

export function QuickSosScreen(_props: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const capabilities = getQuickSosCapabilities();
  const [settings, setSettings] = useState<QuickSosSettings>(
    normalizeSettings(null),
  );
  const [batteryOk, setBatteryOk] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getQuickSosSettings()
      .then(setSettings)
      .catch(() => undefined);
    void isIgnoringBatteryOptimizations()
      .then(setBatteryOk)
      .catch(() => undefined);
  }, []);

  // Recarrega ao voltar das telas do sistema (bateria, Configurações Rápidas).
  useFocusEffect(refresh);

  const update = useCallback(
    async (patch: Parameters<typeof updateQuickSosSettings>[0]) => {
      setError(null);
      setMessage(null);
      try {
        const next = await updateQuickSosSettings(patch);
        setSettings(next);
        if (patch.powerButtonEnabled && !next.serviceRunning) {
          setError(
            "Não foi possível ligar o atalho agora. Confira se você está logada e tente de novo com o app aberto.",
          );
        }
      } catch {
        setError("Não foi possível salvar essa opção.");
      }
    },
    [],
  );

  const addTile = useCallback(async () => {
    setError(null);
    const result = await requestAddQuickSosTile().catch(
      () => "unsupported" as const,
    );
    if (result === "added" || result === "already") {
      setMessage("O bloco “Pedir ajuda” está nas Configurações Rápidas.");
    } else if (result === "declined") {
      setMessage("Tudo bem. Você pode adicionar depois pelo lápis do painel.");
    } else {
      setMessage(
        "Puxe a barra de cima duas vezes, toque no lápis (editar) e arraste o bloco “Pedir ajuda” para os atalhos.",
      );
    }
  }, []);

  const runTest = useCallback(async () => {
    setError(null);
    const counting = await triggerQuickSosNow().catch(() => false);
    setMessage(
      counting
        ? `Contagem de ${settings.countdownSeconds} s iniciada. Toque de novo no bloco, repita o gesto ou use “Cancelar” na notificação para cancelar.`
        : "Teste enviado. O resultado aparece em instantes.",
    );
  }, [settings.countdownSeconds]);

  const isAndroid = Platform.OS === "android";

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={["rgba(255,255,255,0.2)", "rgba(199,22,87,0.2)"]}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(12, insets.top + 6),
            paddingBottom: Math.max(Spacing.xxxl, insets.bottom + 16),
            maxWidth: contentMaxWidth,
          },
        ]}
      >
        <Text style={styles.pageTitle}>SOS rápido</Text>
        <Text style={styles.desc}>
          Dispare o alerta sem abrir o app e sem olhar para a tela. O envio
          acontece mesmo com o app fechado e já manda sua localização.
        </Text>

        {isQuickSosAvailable ? null : (
          <Text style={styles.warning}>
            O SOS rápido só funciona no app instalado (build nativo), não no
            Expo Go.
          </Text>
        )}

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isAndroid && capabilities.powerButton ? (
          <>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.cardTitle}>
                    Botão liga/desliga 3 vezes
                  </Text>
                  <Text style={styles.cardDesc}>
                    Aperte o botão de ligar 3 vezes seguidas (em até ~7 s), com
                    a tela ligada ou desligada. Uma vibração curta confirma que
                    o gesto foi reconhecido; uma vibração longa, que o alerta
                    foi enviado.
                  </Text>
                </View>
                <Switch
                  value={settings.powerButtonEnabled}
                  onValueChange={(v) => void update({ powerButtonEnabled: v })}
                  disabled={!isQuickSosAvailable}
                  trackColor={{ true: "#DA8295", false: "#D9C7CB" }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {settings.powerButtonEnabled ? (
                <Text style={styles.cardHint}>
                  {settings.serviceRunning
                    ? "Ativo. Uma notificação silenciosa e recolhida mantém o atalho funcionando."
                    : "Ligado, mas parado: entre na sua conta para ativar."}
                </Text>
              ) : null}
              <Text style={styles.cardHint}>
                Evite 5 toques: em muitos Android isso aciona a emergência do
                próprio sistema (ligação). Durante ligações o gesto é ignorado.
              </Text>
              <Text style={styles.cardHint}>
                Aperte em ritmo calmo (cerca de 1 toque por segundo). Dois
                toques muito rápidos abrem a câmera em vários aparelhos e o
                gesto não é contado — se preferir, desligue “Abrir câmera
                rapidamente” nos gestos do sistema.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tempo para cancelar</Text>
              <Text style={styles.cardDesc}>
                Depois do gesto, o app espera esse tempo antes de enviar. Para
                cancelar, repita o gesto, toque de novo no bloco ou use
                “Cancelar” na notificação.
              </Text>
              <View style={styles.chips}>
                {COUNTDOWN_OPTIONS.map((seconds: CountdownSeconds) => {
                  const selected = settings.countdownSeconds === seconds;
                  return (
                    <Pressable
                      key={seconds}
                      onPress={() => void update({ countdownSeconds: seconds })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {countdownLabel(seconds)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {capabilities.quickTile ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  Bloco nas Configurações Rápidas
                </Text>
                <Text style={styles.cardDesc}>
                  Puxe a barra de cima e toque em “Pedir ajuda”. Funciona com o
                  celular bloqueado, sem digitar a senha.
                </Text>
                <Pressable
                  onPress={() => void addTile()}
                  accessibilityRole="button"
                  disabled={!isQuickSosAvailable}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {capabilities.addTilePrompt
                      ? "Adicionar o bloco “Pedir ajuda”"
                      : "Como adicionar o bloco"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {batteryOk ? null : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Economia de bateria</Text>
                <Text style={styles.cardDesc}>
                  Alguns celulares (Xiaomi, Samsung, Motorola…) encerram apps em
                  segundo plano. Marque o app como “Sem restrições” / “Não
                  otimizar” para o atalho continuar ativo.
                </Text>
                <Pressable
                  onPress={() => void openBatterySettings()}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    Abrir ajustes de bateria
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {Platform.OS === "ios" ? (
          <>
            {capabilities.appIntents || !isQuickSosAvailable ? null : (
              <Text style={styles.warning}>
                Siri, Toque traseiro e Botão de Ação precisam do iOS 17 ou mais
                novo.
              </Text>
            )}
            {capabilities.appIntents ? (
              <SiriRehearsalCard
                phrase={siriPhrases(APP_NAME)[0] ?? `Ativar SOS no ${APP_NAME}`}
                onSettingsChanged={refresh}
              />
            ) : null}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Falar com a Siri</Text>
              <Text style={styles.cardDesc}>
                Diga “E aí, Siri” e uma das frases — funciona com o iPhone
                bloqueado e a Siri só responde “Pronto.”
              </Text>
              {siriPhrases(APP_NAME)
                .slice(0, 4)
                .map((phrase) => (
                  <Text key={phrase} style={styles.phrase}>
                    “{phrase}”
                  </Text>
                ))}
              {SIRI_APP_NICKNAMES.length > 0 ? (
                <Text style={styles.cardHint}>
                  Se a Siri não entender o nome do app, troque por{" "}
                  {SIRI_APP_NICKNAMES.map((name) => `“${name}”`).join(" ou ")} —
                  por exemplo, “SOS no {SIRI_APP_NICKNAMES.at(-1)}”.
                </Text>
              ) : null}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Frase curta, sem o nome do app
              </Text>
              <Text style={styles.cardDesc}>
                {
                  "1. Abra o app Atalhos › “+” › Adicionar Ação › procure “Pedir ajuda” (deste app).\n2. Dê um nome de duas ou mais palavras, como “Ativar SOS” ou uma frase-código só sua, e salve.\n3. Diga “E aí, Siri” e o nome do atalho."
                }
              </Text>
              <Text style={styles.cardHint}>
                Não use só “SOS” como nome: a Siri responde com uma explicação
                sobre a sigla em vez de rodar o atalho.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Confirmação por vibração</Text>
              <Text style={styles.cardDesc}>
                Quando o alerta é enviado, o iPhone vibra. Com o app fechado a
                vibração vem de um aviso silencioso (“Atalho executado”), então
                mantenha as notificações deste app permitidas. Se o envio
                falhar, não há vibração.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Toque traseiro (3 toques)</Text>
              <Text style={styles.cardDesc}>
                {
                  "1. Crie o atalho como em “Frase curta” acima.\n2. Ajustes › Acessibilidade › Toque › Tocar Atrás › Toque Triplo.\n3. Em “Atalhos”, escolha o atalho que você criou.\nDepois é só dar 3 toques nas costas do iPhone."
                }
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Botão de Ação</Text>
              <Text style={styles.cardDesc}>
                {
                  "iPhone 15 Pro ou mais novo: Ajustes › Botão de Ação › Atalho › escolha “Pedir ajuda”. Segure o botão para enviar."
                }
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Por que não o botão de volume?
              </Text>
              <Text style={styles.cardDesc}>
                O iOS não deixa nenhum app ler os botões físicos. O SOS de
                Emergência do próprio iPhone (segurar o botão lateral + volume)
                liga para a emergência, mas não avisa este app.
              </Text>
            </View>
          </>
        ) : null}

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.cardTitle}>Modo teste</Text>
              <Text style={styles.cardDesc}>
                Para treinar o gesto: tudo funciona igual (vibração, contagem,
                aviso), mas nenhum alerta é enviado. Lembre de desligar depois.
              </Text>
            </View>
            <Switch
              value={settings.testMode}
              onValueChange={(v) => void update({ testMode: v })}
              disabled={!isQuickSosAvailable}
              trackColor={{ true: "#DA8295", false: "#D9C7CB" }}
              thumbColor="#FFFFFF"
            />
          </View>
          {settings.testMode ? (
            <Pressable
              onPress={() => void runTest()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.actionButtonText}>Testar agora</Text>
            </Pressable>
          ) : null}
        </View>
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
  container: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    gap: 16,
  },
  pageTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 22,
    lineHeight: 30,
    color: "#55383E",
    textAlign: "center",
  },
  desc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#55383E",
    textAlign: "center",
  },
  warning: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "#7D1F44",
    backgroundColor: "rgba(199,22,87,0.10)",
    borderRadius: Radius.md,
    padding: 10,
  },
  card: {
    backgroundColor: "rgba(255,221,225,0.6)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E8B8C0",
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#55383E",
  },
  cardDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: "#55383E",
  },
  cardHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 17,
    color: "#7D1F44",
  },
  phrase: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: "#B12E58",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  chips: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#B12E58",
  },
  chipSelected: {
    backgroundColor: "#B12E58",
  },
  chipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#B12E58",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  actionButton: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: "#B12E58",
  },
  actionButtonText: {
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
  success: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "#2F6B3F",
    textAlign: "center",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#B12E58",
    textAlign: "center",
  },
});
