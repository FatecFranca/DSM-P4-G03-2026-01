export type SosButtonPresentation = {
  readonly minHeight: number;
  readonly fontSize: number;
};

const CONTROL_PRESENTATION: SosButtonPresentation = {
  minHeight: 44,
  fontSize: 16,
};

const LARGE_BUTTON_PRESENTATION: SosButtonPresentation = {
  minHeight: 72,
  fontSize: 22,
};

/** Variante desconhecida cai no controle: nunca deixa o botão sumir por erro de digitação. */
export function resolveSosButtonPresentation(
  variantId: string,
): SosButtonPresentation {
  if (variantId === "large_button") {
    return LARGE_BUTTON_PRESENTATION;
  }
  return CONTROL_PRESENTATION;
}
