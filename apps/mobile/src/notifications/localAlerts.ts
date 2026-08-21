import { ensureAndroidAlertsChannel } from "./androidAlertsChannel";
import { canUseExpoNotifications } from "./canUseNotifications";

let handlerReady = false;

/** Configura handler + canal Android; no-op no Expo Go Android. */
export async function setupLocalAlertNotifications(): Promise<void> {
  if (!canUseExpoNotifications() || handlerReady) {
    return;
  }

  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    await ensureAndroidAlertsChannel(Notifications);
    handlerReady = true;
  } catch {
    /* módulo indisponível neste runtime */
  }
}

/** Notificação local pós-disparo do SOS; no-op se o módulo não puder carregar. */
export async function scheduleAlertStartedNotification(
  body: string,
): Promise<void> {
  if (!canUseExpoNotifications()) {
    return;
  }

  try {
    const Notifications = await import("expo-notifications");
    await setupLocalAlertNotifications();
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) {
      await Notifications.requestPermissionsAsync();
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚨 Alerta de Perigo Ativo",
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch {
    /* notificação local opcional — não bloquear o fluxo de alerta */
  }
}
