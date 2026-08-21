import { describe, expect, it } from "vitest";
import type { StoredExperimentEvent } from "./eventStore";
import { summarizeExperimentEvents } from "./summary";

function exposure(
  experiment: string,
  variant: string,
  recordedAtMs = 0,
): StoredExperimentEvent {
  return { type: "experiment_exposed", experiment, variant, recordedAtMs };
}

function conversion(
  experiment: string,
  variant: string,
  metric: string,
  valueMs: number,
  recordedAtMs = 0,
): StoredExperimentEvent {
  return {
    type: "experiment_converted",
    experiment,
    variant,
    metric,
    valueMs,
    recordedAtMs,
  };
}

describe("summarizeExperimentEvents", () => {
  it("devolve lista vazia quando não há eventos", () => {
    expect(summarizeExperimentEvents([])).toEqual([]);
  });

  it("conta exposições e conversões por variante", () => {
    const events: StoredExperimentEvent[] = [
      exposure("sos_button_layout", "control"),
      exposure("sos_button_layout", "control"),
      conversion("sos_button_layout", "control", "sos_time_to_trigger", 2000),
    ];

    const [summary] = summarizeExperimentEvents(events);

    expect(summary.experimentKey).toBe("sos_button_layout");
    expect(summary.variants).toEqual([
      {
        variantId: "control",
        exposures: 2,
        conversions: 1,
        conversionRate: 0.5,
        avgValueMs: 2000,
      },
    ]);
  });

  it("calcula a média de tempo entre múltiplas conversões", () => {
    const events: StoredExperimentEvent[] = [
      exposure("sos_button_layout", "large_button"),
      conversion("sos_button_layout", "large_button", "sos_time_to_trigger", 1000),
      conversion("sos_button_layout", "large_button", "sos_time_to_trigger", 3000),
    ];

    const [summary] = summarizeExperimentEvents(events);

    expect(summary.variants[0].avgValueMs).toBe(2000);
  });

  it("não gera divisão por zero quando não há exposição registrada", () => {
    const events: StoredExperimentEvent[] = [
      conversion("sos_button_layout", "control", "sos_time_to_trigger", 500),
    ];

    const [summary] = summarizeExperimentEvents(events);

    expect(summary.variants[0].conversionRate).toBe(0);
  });

  it("devolve avgValueMs nulo quando a variante não converteu ainda", () => {
    const events: StoredExperimentEvent[] = [
      exposure("sos_button_layout", "control"),
    ];

    const [summary] = summarizeExperimentEvents(events);

    expect(summary.variants[0].avgValueMs).toBeNull();
  });

  it("separa variantes do mesmo experimento", () => {
    const events: StoredExperimentEvent[] = [
      exposure("sos_button_layout", "control"),
      exposure("sos_button_layout", "large_button"),
      exposure("sos_button_layout", "large_button"),
    ];

    const [summary] = summarizeExperimentEvents(events);
    const variantIds = summary.variants.map((v) => v.variantId).sort();

    expect(variantIds).toEqual(["control", "large_button"]);
  });

  it("separa experimentos diferentes em entradas distintas, ordenadas por chave", () => {
    const events: StoredExperimentEvent[] = [
      exposure("onboarding_flow", "control"),
      exposure("sos_button_layout", "control"),
    ];

    const keys = summarizeExperimentEvents(events).map((s) => s.experimentKey);

    expect(keys).toEqual(["onboarding_flow", "sos_button_layout"]);
  });
});
