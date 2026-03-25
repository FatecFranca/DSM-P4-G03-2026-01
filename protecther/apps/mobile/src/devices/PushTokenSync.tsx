import { RegisterPushTokenRequestSchema } from "@protecther/contracts";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";

let notificationHandlerRegistered = false;

export function PushTokenSync() {
  const { state } = useAuth();
  const accessToken =
    state.status === "authenticated" ? state.session.accessToken : null;

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    if (Platform.OS === "web") {
      return;
    }
    /* Expo Go não suporta push remoto no Android (SDK 53+); evita carregar o módulo e os WARNs. */
    if (Constants.appOwnership === "expo") {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (!notificationHandlerRegistered) {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          notificationHandlerRegistered = true;
        }
        const existing = await Notifications.getPermissionsAsync();
        const granted =
          existing.status === "granted"
            ? true
            : (await Notifications.requestPermissionsAsync()).status ===
              "granted";
        if (!granted || cancelled) {
          return;
        }
        const native = await Notifications.getDevicePushTokenAsync();
        const token =
          typeof native.data === "string" ? native.data : String(native.data);
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const body = RegisterPushTokenRequestSchema.parse({ platform, token });
        await apiFetchJson("/devices/push-token", {
          method: "POST",
          body: JSON.stringify(body),
          accessToken,
        });
      } catch {
        /* Simulador sem push ou projeto sem credenciais — ignorar. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return null;
}
