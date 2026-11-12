import AsyncStorage from "@react-native-async-storage/async-storage";

const PRIVACY_SCREEN_KEY = "protecther.appearance.privacyScreen";

/** Padrão: ligado — sem prévia do app na tela de apps recentes. */
export async function readPrivacyScreenPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PRIVACY_SCREEN_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

export async function savePrivacyScreenPreference(
  enabled: boolean,
): Promise<void> {
  await AsyncStorage.setItem(PRIVACY_SCREEN_KEY, enabled ? "1" : "0");
}
