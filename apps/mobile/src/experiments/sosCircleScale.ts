const CONTROL_SCALE = 1;
const LARGE_BUTTON_SCALE = 1.12;

/** Multiplicador aplicado ao tamanho base do botão SOS circular da Home. */
export function resolveSosCircleScale(variantId: string): number {
  if (variantId === "large_button") {
    return LARGE_BUTTON_SCALE;
  }
  return CONTROL_SCALE;
}
