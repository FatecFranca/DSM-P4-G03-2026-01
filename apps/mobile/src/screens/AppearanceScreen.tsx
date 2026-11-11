import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
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
  isDiscreetIconSupported,
  setActiveIconKey,
} from "../appearance/discreetIconNative";
import { DISCREET_ICON_PREVIEWS } from "../appearance/discreetIconPreviews";
import {
  DEFAULT_ICON_KEY,
  DISCREET_ICONS,
  type DiscreetIconKey,
  getDiscreetIcon,
} from "../appearance/discreetIcons";
import {
  readPrivacyScreenPreference,
  savePrivacyScreenPreference,
} from "../appearance/privacyPreference";
import type { AppStackParamList } from "../navigation/types";
import { Radius, Spacing } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "Appearance">;

export function AppearanceScreen(_props: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentMaxWidth = Math.min(520, Math.max(320, width - 20));
  const [activeKey, setActiveKey] = useState<DiscreetIconKey>(DEFAULT_ICON_KEY);
  const [busyKey, setBusyKey] = useState<DiscreetIconKey | null>(null);
  const [privacyScreen, setPrivacyScreen] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getActiveIconKey()
      .then(setActiveKey)
      .catch(() => undefined);
    void readPrivacyScreenPreference().then(setPrivacyScreen);
  }, []);

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
          Escolha como o app aparece na tela inicial do seu celular. Só você
          precisa saber que ele é um app de proteção.
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
