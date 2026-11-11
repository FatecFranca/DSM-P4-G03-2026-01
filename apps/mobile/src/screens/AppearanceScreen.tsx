import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
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
import {
  applyPrivacyScreen,
  getActiveIconKey,
  getIconHidden,
  isDiscreetIconSupported,
  isHideAppSupported,
  requestAddQuickTile,
  setActiveIconKey,
  setIconHidden,
} from "../appearance/discreetIconNative";
import { DISCREET_ICON_PREVIEWS } from "../appearance/discreetIconPreviews";
import {
  DEFAULT_ICON_KEY,
  DISCREET_ICONS,
  type DiscreetIconKey,
  SECRET_CODE_DIAL,
  getDiscreetIcon,
} from "../appearance/discreetIcons";
import {
  readPrivacyScreenPreference,
  savePrivacyScreenPreference,
} from "../appearance/privacyPreference";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "Appearance">;

/** Único jeito de voltar com o app oculto (nem todo discador aceita códigos secretos). */
const HOW_TO_REOPEN = `puxe a barra de cima (Configurações Rápidas) e toque no atalho “ProtectHer”; depois, aqui em Aparência, toque em “Mostrar ícone de novo”. Se o atalho não estiver lá, edite os atalhos (lápis) e arraste-o. Plano B: discar ${SECRET_CODE_DIAL} (nem todo celular aceita).`;

export function AppearanceScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const [activeKey, setActiveKey] = useState<DiscreetIconKey>(DEFAULT_ICON_KEY);
  const [busyKey, setBusyKey] = useState<DiscreetIconKey | null>(null);
  const [privacyScreen, setPrivacyScreen] = useState(true);
  const [appHidden, setAppHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getActiveIconKey()
      .then(setActiveKey)
      .catch(() => undefined);
    void getIconHidden()
      .then(setAppHidden)
      .catch(() => undefined);
    void readPrivacyScreenPreference().then(setPrivacyScreen);
  }, []);

  const hideApp = useCallback(async () => {
    setError(null);
    setMessage(null);
    try {
      await setIconHidden(true);
      setAppHidden(true);
      setMessage(
        `Pronto. O app saiu da tela inicial. Para abrir: ${HOW_TO_REOPEN}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ocultar o app.",
      );
    }
  }, []);

  const showApp = useCallback(async () => {
    setError(null);
    setMessage(null);
    try {
      await setIconHidden(false);
      setAppHidden(false);
      setMessage("Pronto. O ícone voltou para a tela inicial.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível mostrar o ícone.",
      );
    }
  }, []);

  const addQuickTile = useCallback(async () => {
    setError(null);
    setMessage(null);
    const result = await requestAddQuickTile().catch(
      () => "unsupported" as const,
    );
    if (result === "added" || result === "already") {
      setMessage(
        "Pronto. O atalho “ProtectHer” está nas Configurações Rápidas.",
      );
    } else if (result === "declined") {
      setError("O atalho não foi adicionado.");
    } else {
      setError(
        "Este celular não permite adicionar o atalho daqui. Adicione manualmente: puxe a barra de cima, toque no lápis e arraste “ProtectHer”.",
      );
    }
    return result;
  }, []);

  const hideWithTile = useCallback(async () => {
    const result = await addQuickTile();
    if (result === "added" || result === "already") {
      await hideApp();
      return;
    }
    Alert.alert(
      "Ocultar sem o atalho?",
      `Sem o atalho nas Configurações Rápidas, só dá para abrir o app discando ${SECRET_CODE_DIAL}, e nem todo celular aceita esse código. Recomendamos adicionar o atalho antes.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Ocultar mesmo assim",
          style: "destructive",
          onPress: () => void hideApp(),
        },
      ],
    );
  }, [addQuickTile, hideApp]);

  const confirmHideApp = useCallback(() => {
    Alert.alert(
      "Ocultar o app?",
      `O ícone some da tela inicial e da lista de apps. Para abrir de novo: ${HOW_TO_REOPEN}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Ocultar",
          style: "destructive",
          onPress: () => void hideWithTile(),
        },
      ],
    );
  }, [hideWithTile]);

  // Ação rápida (long-press no ícone) "Ocultar app" chega aqui com { hide: true }.
  const hideRequested = route.params?.hide === true;
  useEffect(() => {
    if (!hideRequested) {
      return;
    }
    navigation.setParams({ hide: undefined });
    if (isHideAppSupported) {
      confirmHideApp();
    }
  }, [hideRequested, navigation, confirmHideApp]);

  const selectIcon = useCallback(
    async (key: DiscreetIconKey) => {
      if (key === activeKey || busyKey) {
        return;
      }
      setError(null);
      setMessage(null);
      setBusyKey(key);
      try {
        await setActiveIconKey(key);
        setActiveKey(key);
        setAppHidden(false);
        setMessage(
          Platform.OS === "android"
            ? `Pronto. Na tela inicial o app passa a aparecer como “${getDiscreetIcon(key).label}” (pode levar alguns segundos).`
            : `Pronto. Na tela inicial o app passa a aparecer como “${getDiscreetIcon(key).label}”.`,
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível trocar o ícone. Tente novamente.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [activeKey, busyKey],
  );

  const togglePrivacy = useCallback(async (enabled: boolean) => {
    setPrivacyScreen(enabled);
    try {
      await savePrivacyScreenPreference(enabled);
      await applyPrivacyScreen(enabled);
    } catch {
      setError("Não foi possível salvar essa opção.");
    }
  }, []);

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
        <Text style={styles.pageTitle}>Aparência e discrição</Text>
        <Text style={styles.desc}>
          O app usa o ícone original por padrão. Se quiser deixá-lo mais
          discreto, escolha um disfarce abaixo; você pode voltar ao original a
          qualquer momento.
        </Text>

        {isDiscreetIconSupported ? null : (
          <Text style={styles.warning}>
            A troca de ícone só funciona no app instalado (build nativo), não no
            Expo Go.
          </Text>
        )}

        <View style={styles.grid}>
          {DISCREET_ICONS.map((icon) => {
            const selected = icon.key === activeKey;
            return (
              <Pressable
                key={icon.key}
                onPress={() => void selectIcon(icon.key)}
                disabled={!isDiscreetIconSupported || busyKey !== null}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${icon.label}. ${icon.description}`}
                style={({ pressed }) => [
                  styles.tile,
                  selected && styles.tileSelected,
                  (pressed || busyKey === icon.key) && styles.pressed,
                  !isDiscreetIconSupported && styles.disabled,
                ]}
              >
                <Image
                  source={DISCREET_ICON_PREVIEWS[icon.key]}
                  style={styles.preview}
                />
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {icon.label}
                </Text>
                {selected ? (
                  <Text style={styles.tileCheck}>✓ Em uso</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isHideAppSupported ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {appHidden ? "App oculto" : "Ocultar o app"}
            </Text>
            <Text style={styles.cardDesc}>
              {appHidden
                ? `O ícone não aparece na tela inicial. Para abrir: ${HOW_TO_REOPEN}`
                : `Tira o ícone da tela inicial e da lista de apps. Para abrir de novo: ${HOW_TO_REOPEN} Também dá para ocultar segurando o ícone do app e tocando em “Ocultar app”.`}
            </Text>
            <Pressable
              onPress={appHidden ? () => void showApp() : confirmHideApp}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.actionButtonText}>
                {appHidden ? "Mostrar ícone de novo" : "Ocultar o app"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void addQuickTile()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                Adicionar atalho nas Configurações Rápidas
              </Text>
            </Pressable>
          </View>
        ) : null}

        {Platform.OS === "ios" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ocultar o app no iPhone</Text>
            <Text style={styles.cardDesc}>
              {
                "O iOS não deixa um app se ocultar sozinho, mas o sistema faz isso (iOS 18 ou mais novo):\n1. Segure o ícone do app na tela inicial.\n2. Toque em “Exigir Face ID” (ou Touch ID / código).\n3. Escolha “Ocultar e exigir Face ID”.\nO app passa a ficar na pasta “Ocultos”, no fim da Biblioteca de Apps."
              }
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.cardTitle}>
                Ocultar prévia nos apps recentes
              </Text>
              <Text style={styles.cardDesc}>
                {Platform.OS === "android"
                  ? "A tela do app não aparece na lista de apps abertos. Em Android 12 ou anterior, isso também bloqueia capturas de tela."
                  : "A tela do app fica em branco na lista de apps abertos."}
              </Text>
            </View>
            <Switch
              value={privacyScreen}
              onValueChange={(v) => void togglePrivacy(v)}
              disabled={!isDiscreetIconSupported}
              trackColor={{ true: "#DA8295", false: "#D9C7CB" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>O que isso não esconde</Text>
          <Text style={styles.cardDesc}>
            {
              "• Em Configurações do celular, a lista de apps instalados mostra o nome padrão do app.\n• A loja de apps (Play Store / App Store) guarda o histórico de instalação.\n• Ao abrir o app, a tela dele continua sendo a do ProtectHer.\n• No iPhone, o sistema mostra um aviso ao trocar o ícone."
            }
          </Text>
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  tile: {
    width: "31%",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  tileSelected: {
    borderColor: "#DA8295",
    backgroundColor: "rgba(255,221,225,0.6)",
  },
  preview: {
    width: 64,
    height: 64,
    borderRadius: 15,
  },
  tileLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#55383E",
  },
  tileCheck: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "#B12E58",
    marginTop: -4,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
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
  actionButton: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: "#B12E58",
  },
  secondaryButton: {
    alignSelf: "stretch",
    alignItems: "center",
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
  actionButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
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
