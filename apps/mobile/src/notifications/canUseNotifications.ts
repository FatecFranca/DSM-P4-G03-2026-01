import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

/**
 * No Expo Go Android (SDK 53+), importar `expo-notifications` executa
 * `DevicePushTokenAutoRegistration.fx`, que chama `addPushTokenListener` e
 * lança erro fatal. Dev client / builds nativos continuam ok.
 */
export function canUseExpoNotifications(): boolean {
  if (Platform.OS === "web") {
    return false;
  }
  if (Platform.OS === "android" && isRunningInExpoGo()) {
    return false;
  }
  return true;
}
