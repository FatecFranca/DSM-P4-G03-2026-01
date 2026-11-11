import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { Linking, Platform } from "react-native";
import { canUseExpoNotifications } from "../notifications/canUseNotifications";
import type { MicPermissionSnapshot } from "./sosAudio";

const MIC_EXPLANATION_DISMISSED_KEY =
  "protecther.sosAudio.micExplanationDismissedAt";

export async function readMicPermission(): Promise<MicPermissionSnapshot> {
  try {
    const res = await getRecordingPermissionsAsync();
    return { granted: res.granted, canAskAgain: res.canAskAgain };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

/**
 * Mostra o pedido do sistema. Se o sistema não deixa mais perguntar (a pessoa
 * negou antes), abre os Ajustes do app.
 */
export async function requestMicPermission(): Promise<boolean> {
  const current = await readMicPermission();
  if (current.granted) {
    return true;
  }
  if (!current.canAskAgain) {
    await Linking.openSettings().catch(() => undefined);
    return false;
  }
  try {
    const res = await requestRecordingPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

export async function readMicExplanationDismissedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(MIC_EXPLANATION_DISMISSED_KEY);
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function saveMicExplanationDismissedAt(ms: number): Promise<void> {
  await AsyncStorage.setItem(MIC_EXPLANATION_DISMISSED_KEY, String(ms));
}

/**
 * No Android 13+ o serviço de gravação em segundo plano precisa da permissão de
 * notificações (a notificação "Alerta ativo" é obrigatória). Sem ela, grava só
 * com o app aberto. No iOS não há essa exigência.
 */
export async function canRecordInBackground(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  if (!canUseExpoNotifications()) {
    return false;
  }
  try {
    const Notifications = await import("expo-notifications");
    const perm = await Notifications.getPermissionsAsync();
    return perm.granted;
  } catch {
    return false;
  }
}
