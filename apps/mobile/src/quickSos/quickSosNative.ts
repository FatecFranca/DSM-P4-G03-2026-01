import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import {
  type CountdownSeconds,
  NO_CAPABILITIES,
  type QuickSosCapabilities,
  type QuickSosSettings,
  type QuickSosTriggerResult,
  normalizeCapabilities,
  normalizeSettings,
  parseTriggerResult,
} from "./quickSos";

type Subscription = { remove(): void };

/** Módulo local `modules/quick-sos` (só existe em dev build / build de produção). */
type QuickSosNative = {
  getCapabilities(): unknown;
  setSession(apiBaseUrl: string, accessToken: string): Promise<unknown>;
  clearSession(): Promise<unknown>;
  getSettings(): Promise<unknown>;
  setSettings(patch: Partial<SettingsPatch>): Promise<unknown>;
  consumePendingTrigger(): Promise<unknown>;
  triggerNow(): Promise<boolean>;
  cancelCountdown(): Promise<boolean>;
  requestAddTile?(): Promise<number>;
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
  openBatterySettings?(): Promise<boolean>;
  addListener(
    event: "onTrigger",
    listener: (payload: unknown) => void,
  ): Subscription;
};

type SettingsPatch = {
  powerButtonEnabled: boolean;
  countdownSeconds: CountdownSeconds;
  testMode: boolean;
};

const native =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<QuickSosNative>("QuickSos");

/** false no Expo Go / web: o módulo nativo não está embutido. */
export const isQuickSosAvailable = native !== null;

export function getQuickSosCapabilities(): QuickSosCapabilities {
  if (!native) {
    return NO_CAPABILITIES;
  }
  try {
    return normalizeCapabilities(native.getCapabilities());
  } catch {
    return NO_CAPABILITIES;
  }
}

export async function syncQuickSosSession(
  session: { apiBaseUrl: string; accessToken: string } | null,
): Promise<void> {
  if (!native) {
    return;
  }
  if (session) {
    await native.setSession(session.apiBaseUrl, session.accessToken);
  } else {
    await native.clearSession();
  }
}

export async function getQuickSosSettings(): Promise<QuickSosSettings> {
  return normalizeSettings(native ? await native.getSettings() : null);
}

export async function updateQuickSosSettings(
  patch: Partial<SettingsPatch>,
): Promise<QuickSosSettings> {
  if (!native) {
    return normalizeSettings(null);
  }
  return normalizeSettings(await native.setSettings(patch));
}

export async function consumePendingQuickSos(): Promise<QuickSosTriggerResult | null> {
  if (!native) {
    return null;
  }
  return parseTriggerResult(await native.consumePendingTrigger());
}

export function onQuickSosTrigger(
  listener: (result: QuickSosTriggerResult) => void,
): () => void {
  if (!native) {
    return () => undefined;
  }
  const sub = native.addListener("onTrigger", (payload) => {
    const result = parseTriggerResult(payload);
    if (result) {
      listener(result);
    }
  });
  return () => sub.remove();
}

/** Roda o mesmo fluxo do gesto (com contagem no Android). true = contagem iniciada. */
export async function triggerQuickSosNow(): Promise<boolean> {
  return native ? native.triggerNow() : false;
}

export async function cancelQuickSosCountdown(): Promise<boolean> {
  return native ? native.cancelCountdown() : false;
}

export type AddTileResult = "added" | "already" | "declined" | "unsupported";

export async function requestAddQuickSosTile(): Promise<AddTileResult> {
  if (!native?.requestAddTile) {
    return "unsupported";
  }
  const code = await native.requestAddTile();
  if (code === 2) return "added";
  if (code === 1) return "already";
  if (code === 0) return "declined";
  return "unsupported";
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!native?.isIgnoringBatteryOptimizations) {
    return true;
  }
  return native.isIgnoringBatteryOptimizations();
}

export async function openBatterySettings(): Promise<boolean> {
  return native?.openBatterySettings ? native.openBatterySettings() : false;
}
