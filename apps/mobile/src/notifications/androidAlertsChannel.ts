import { Platform } from "react-native";

let ready = false;

/**
 * Canal Android para alertas. Sem `sound` customizado — usa o som padrão do sistema.
 * (A string "default" no expo-notifications exige arquivo .wav no bundle.)
 */
export async function ensureAndroidAlertsChannel(
  Notifications: typeof import("expo-notifications"),
): Promise<void> {
  if (Platform.OS !== "android" || ready) {
    return;
  }
  await Notifications.setNotificationChannelAsync("alerts", {
    name: "Alertas ProtectHer",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 100, 300],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  ready = true;
}
