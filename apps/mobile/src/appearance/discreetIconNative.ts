import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import {
  DEFAULT_ICON_KEY,
  type DiscreetIconKey,
  fromNativeIconName,
  toNativeIconName,
} from "./discreetIcons";

/** Módulo local `modules/discreet-icon` (só existe em dev build / build de produção). */
type DiscreetIconNative = {
  getActiveIcon(): Promise<string | null>;
  setActiveIcon(name: string | null): Promise<string | null>;
  isIconHidden?(): Promise<boolean>;
  setIconHidden?(hidden: boolean, fallbackKey: string): Promise<boolean>;
  requestAddQuickTile?(): Promise<number>;
  setPrivacyScreen(enabled: boolean): Promise<boolean>;
};

const native =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<DiscreetIconNative>("DiscreetIcon");

const platform = Platform.OS === "ios" ? "ios" : "android";

/** false no Expo Go e na web: o módulo nativo não está embutido. */
export const isDiscreetIconSupported = native !== null;

/**
 * Ocultar o app do launcher só existe no Android (e em build que já tenha a função).
 * O iOS não permite isso a um app: o usuário usa "Exigir Face ID > Ocultar" do sistema.
 */
export const isHideAppSupported =
  Platform.OS === "android" && typeof native?.setIconHidden === "function";

export async function getActiveIconKey(): Promise<DiscreetIconKey> {
  if (!native) {
    return fromNativeIconName(null);
  }
  return fromNativeIconName(await native.getActiveIcon());
}

export async function getIconHidden(): Promise<boolean> {
  if (!isHideAppSupported || !native?.isIconHidden) {
    return false;
  }
  return native.isIconHidden();
}

export type QuickTileResult = "added" | "already" | "declined" | "unsupported";

/**
 * Pede ao Android (13+) para adicionar às Configurações Rápidas o atalho que abre o app
 * mesmo oculto. "unsupported" = versão antiga / build sem a função.
 */
export async function requestAddQuickTile(): Promise<QuickTileResult> {
  if (!isHideAppSupported || !native?.requestAddQuickTile) {
    return "unsupported";
  }
  const code = await native.requestAddQuickTile();
  if (code === 2) {
    return "added";
  }
  if (code === 1) {
    return "already";
  }
  return code === 0 ? "declined" : "unsupported";
}

export async function setIconHidden(hidden: boolean): Promise<void> {
  if (!isHideAppSupported || !native?.setIconHidden) {
    throw new Error("Ocultar o app não está disponível neste build.");
  }
  await native.setIconHidden(hidden, DEFAULT_ICON_KEY);
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
