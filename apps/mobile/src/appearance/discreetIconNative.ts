import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import {
  type DiscreetIconKey,
  fromNativeIconName,
  toNativeIconName,
} from "./discreetIcons";

/** Módulo local `modules/discreet-icon` (só existe em dev build / build de produção). */
type DiscreetIconNative = {
  getActiveIcon(): Promise<string | null>;
  setActiveIcon(name: string | null): Promise<string | null>;
  setPrivacyScreen(enabled: boolean): Promise<boolean>;
};

const native =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<DiscreetIconNative>("DiscreetIcon");

const platform = Platform.OS === "ios" ? "ios" : "android";

/** false no Expo Go e na web: o módulo nativo não está embutido. */
export const isDiscreetIconSupported = native !== null;

export async function getActiveIconKey(): Promise<DiscreetIconKey> {
  if (!native) {
    return fromNativeIconName(null);
  }
  return fromNativeIconName(await native.getActiveIcon());
}

export async function setActiveIconKey(key: DiscreetIconKey): Promise<void> {
  if (!native) {
    throw new Error("Troca de ícone indisponível neste build.");
  }
  await native.setActiveIcon(toNativeIconName(key, platform));
}

export async function applyPrivacyScreen(enabled: boolean): Promise<void> {
  if (!native) {
    return;
  }
  await native.setPrivacyScreen(enabled);
}
