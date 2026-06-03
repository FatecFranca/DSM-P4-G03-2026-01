import {
  ContactsAlertFeedResponseSchema,
  RegisterPushTokenRequestSchema,
} from "@protecther/contracts";
import Constants from "expo-constants";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { logMobileTelemetry } from "../lib/telemetry";
import { navigationRef } from "../navigation/navigationRef";
import { ensureAndroidAlertsChannel } from "../notifications/androidAlertsChannel";

let notificationHandlerRegistered = false;

async function registerPushToken(accessToken: string): Promise<void> {
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
  await ensureAndroidAlertsChannel(Notifications);
  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.status === "granted"
      ? true
      : (await Notifications.requestPermissionsAsync()).status === "granted";
  if (!granted) {
    logMobileTelemetry("push_permission_denied", { platform: Platform.OS });
    return;
  }
  const native = await Notifications.getDevicePushTokenAsync();
  const token =
    typeof native.data === "string" ? native.data : String(native.data);
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const body = RegisterPushTokenRequestSchema.parse({ platform, token });
  const result = await apiFetchJson("/devices/push-token", {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });
  if (!result.ok) {
    logMobileTelemetry("push_token_register_failed", {
      platform,
      status: result.status,
    });
    return;
  }
  logMobileTelemetry("push_token_registered", {
    platform,
    tokenPrefix: token.slice(0, 12),
  });
}

function getStringDataValue(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function PushTokenSync() {
  const { state } = useAuth();
  const accessToken =
    state.status === "authenticated" ? state.session.accessToken : null;
  const pushRegisteredRef = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      pushRegisteredRef.current = false;
      return;
    }
    if (Platform.OS === "web") {
      return;
    }
    /* Expo Go não suporta push remoto no Android (SDK 53+); evita carregar o módulo e os WARNs. */
    if (Constants.appOwnership === "expo") {
      logMobileTelemetry("push_token_skipped", { reason: "expo_go" });
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        if (cancelled || pushRegisteredRef.current) {
          return;
        }
        await registerPushToken(accessToken);
        pushRegisteredRef.current = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        logMobileTelemetry("push_token_register_failed", {
          platform: Platform.OS,
          reason: message.slice(0, 120),
        });
      }
    };
    void run();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && !cancelled && !pushRegisteredRef.current) {
        void run();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || Platform.OS === "web") {
      return;
    }
    if (Constants.appOwnership === "expo") {
      return;
    }
    let sub: { remove: () => void } | null = null;
    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        sub = Notifications.addNotificationReceivedListener(() => {
          logMobileTelemetry("push_notification_received", {
            platform: Platform.OS,
          });
        });
      } catch {
        /* ignore */
      }
    })();
    return () => sub?.remove();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    if (Platform.OS === "web") {
      return;
    }
    if (Constants.appOwnership === "expo") {
      return;
    }

    let subscription: { remove: () => void } | null = null;

    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content.data as Record<
              string,
              unknown
            >;
            const alertId = getStringDataValue(data, "alertId");
            if (data?.kind !== "alert_started" || !alertId) {
              return;
            }

            void (async () => {
              try {
                const result = await apiFetchJson<unknown>(
                  "/alerts/contacts-feed",
                  {
                    method: "GET",
                    accessToken,
                  },
                );
                if (!result.ok || !navigationRef.isReady()) {
                  return;
                }

                const parsed = ContactsAlertFeedResponseSchema.safeParse(
                  result.data,
                );
                if (!parsed.success) {
                  navigationRef.navigate("ContactAlertsFeed");
                  return;
                }

                const item = parsed.data.items.find(
                  (feedItem) => feedItem.alert.id === alertId,
                );
                if (!item) {
                  navigationRef.navigate("ContactAlertsFeed");
                  return;
                }

                navigationRef.navigate("ContactAlertDetail", {
                  alertId: item.alert.id,
                  ownerName: item.owner.name,
                  startedAt: item.alert.startedAt,
                });
              } catch {
                if (navigationRef.isReady()) {
                  navigationRef.navigate("ContactAlertsFeed");
                }
              }
            })();
          },
        );
      } catch {
        /* expo-notifications indisponível — ignorar. */
      }
    })();

    return () => {
      subscription?.remove();
    };
  }, [accessToken]);

  return null;
}
