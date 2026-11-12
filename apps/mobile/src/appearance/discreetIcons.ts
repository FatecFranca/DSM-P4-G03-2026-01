import catalog from "./discreetIcons.json";

/**
 * Catálogo de disfarces do ícone do app. A lista (chaves, nomes, cores) vive em
 * discreetIcons.json porque o config plugin e o gerador de artes também a usam.
 */
export type DiscreetIconKey =
  | "original"
  | "notes"
  | "calculator"
  | "weather"
  | "calendar"
  | "cycle"
  | "clock";

export type DiscreetIconEntry = {
  key: DiscreetIconKey;
  /** Nome exibido sob o ícone no launcher. */
  label: string;
  description: string;
};

export type NativePlatform = "ios" | "android";

export const DEFAULT_ICON_KEY = catalog.defaultKey as DiscreetIconKey;

/** Código para discar no app Telefone e trazer o ícone de volta quando o app está oculto. */
export const SECRET_CODE_DIAL = `*#*#${catalog.secretCode}#*#*`;

export const DISCREET_ICONS: readonly DiscreetIconEntry[] = catalog.icons.map(
  ({ key, label, description }) => ({
    key: key as DiscreetIconKey,
    label,
    description,
  }),
);

export function isDiscreetIconKey(value: unknown): value is DiscreetIconKey {
  return DISCREET_ICONS.some((icon) => icon.key === value);
}

export function getDiscreetIcon(key: DiscreetIconKey): DiscreetIconEntry {
  const found = DISCREET_ICONS.find((icon) => icon.key === key);
  if (!found) {
    throw new Error(`Ícone desconhecido: ${key}`);
  }
  return found;
}

/**
 * Nome entregue ao módulo nativo.
 * - Android: toda chave é um activity-alias (o padrão também).
 * - iOS: o padrão é o ícone principal do app, que se restaura com `null`.
 */
export function toNativeIconName(
  key: DiscreetIconKey,
  platform: NativePlatform,
): string | null {
  if (platform === "ios" && key === DEFAULT_ICON_KEY) {
    return null;
  }
  return key;
}

/** Converte o que o módulo nativo devolve; qualquer valor inválido vira o padrão. */
export function fromNativeIconName(
  name: string | null | undefined,
): DiscreetIconKey {
  return isDiscreetIconKey(name) ? name : DEFAULT_ICON_KEY;
}
