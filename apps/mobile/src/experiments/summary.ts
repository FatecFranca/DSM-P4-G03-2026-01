import type { StoredExperimentEvent } from "./eventStore";

export type VariantSummary = {
  readonly variantId: string;
  readonly exposures: number;
  readonly conversions: number;
  /** 0 a 1. Zero quando não há exposição registrada, nunca NaN. */
  readonly conversionRate: number;
  readonly avgValueMs: number | null;
};

export type ExperimentSummary = {
  readonly experimentKey: string;
  readonly variants: readonly VariantSummary[];
};

type VariantAccumulator = {
  exposures: number;
  conversions: number;
  valueMsSum: number;
  valueMsCount: number;
};

export function summarizeExperimentEvents(
  events: readonly StoredExperimentEvent[],
): readonly ExperimentSummary[] {
  const byExperiment = new Map<string, Map<string, VariantAccumulator>>();

  for (const event of events) {
    const variants =
      byExperiment.get(event.experiment) ??
      new Map<string, VariantAccumulator>();
    byExperiment.set(event.experiment, variants);

    const accumulator = variants.get(event.variant) ?? {
      exposures: 0,
      conversions: 0,
      valueMsSum: 0,
      valueMsCount: 0,
    };
    variants.set(event.variant, accumulator);

    if (event.type === "experiment_exposed") {
      accumulator.exposures += 1;
    } else {
      accumulator.conversions += 1;
      if (typeof event.valueMs === "number") {
        accumulator.valueMsSum += event.valueMs;
        accumulator.valueMsCount += 1;
      }
    }
  }

  return Array.from(byExperiment.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([experimentKey, variants]) => ({
      experimentKey,
      variants: Array.from(variants.entries()).map(
        ([variantId, accumulator]): VariantSummary => ({
          variantId,
          exposures: accumulator.exposures,
          conversions: accumulator.conversions,
          conversionRate:
            accumulator.exposures > 0
              ? accumulator.conversions / accumulator.exposures
              : 0,
          avgValueMs:
            accumulator.valueMsCount > 0
              ? accumulator.valueMsSum / accumulator.valueMsCount
              : null,
        }),
      ),
    }));
}
