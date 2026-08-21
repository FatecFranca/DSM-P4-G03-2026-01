export type ExperimentTelemetrySink = (
  event: "experiment_exposed" | "experiment_converted",
  fields: Record<string, string | number>,
) => void;

export type ExperimentTracker = {
  /** Registra que o usuário viu a variante. Repetições são descartadas. */
  trackExposure: (
    experimentKey: string,
    variantId: string,
    userId: string,
  ) => void;
  /** Registra o desfecho medido. Sem exposição prévia não há o que atribuir. */
  trackConversion: (
    experimentKey: string,
    metric: string,
    valueMs: number,
  ) => void;
};

type Exposure = {
  readonly userId: string;
  readonly variantId: string;
};

export function createExperimentTracker(
  sink: ExperimentTelemetrySink,
): ExperimentTracker {
  const exposures = new Map<string, Exposure>();

  return {
    trackExposure(experimentKey, variantId, userId) {
      const previous = exposures.get(experimentKey);

      if (previous?.userId === userId && previous.variantId === variantId) {
        return;
      }

      exposures.set(experimentKey, { userId, variantId });
      sink("experiment_exposed", {
        experiment: experimentKey,
        variant: variantId,
      });
    },

    trackConversion(experimentKey, metric, valueMs) {
      const exposure = exposures.get(experimentKey);

      if (!exposure) {
        return;
      }

      sink("experiment_converted", {
        experiment: experimentKey,
        variant: exposure.variantId,
        metric,
        valueMs,
      });
    },
  };
}
