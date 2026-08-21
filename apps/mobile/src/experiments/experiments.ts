import type { Experiment } from "./types";

/**
 * Hipótese: um botão de acionamento maior e com rótulo explícito reduz o tempo
 * até disparar o alerta — o que, em uma emergência real, é a métrica que importa.
 * Métrica primária: `sos_time_to_trigger` (ms entre abrir a tela e disparar).
 */
export const SOS_BUTTON_EXPERIMENT: Experiment = {
  key: "sos_button_layout",
  controlVariantId: "control",
  variants: [
    { id: "control", weight: 1 },
    { id: "large_button", weight: 1 },
  ],
};

export const EXPERIMENTS = [SOS_BUTTON_EXPERIMENT] as const;
