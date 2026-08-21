import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExperimentTracker } from "./tracking";

describe("createExperimentTracker", () => {
  const sink = vi.fn();

  beforeEach(() => {
    sink.mockClear();
  });

  it("registra a exposição do usuário à variante", () => {
    const tracker = createExperimentTracker(sink);

    tracker.trackExposure("sos_button_layout", "large_button", "user-1");

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("experiment_exposed", {
      experiment: "sos_button_layout",
      variant: "large_button",
    });
  });

  it("não repete a exposição do mesmo usuário no mesmo experimento", () => {
    const tracker = createExperimentTracker(sink);

    tracker.trackExposure("sos_button_layout", "large_button", "user-1");
    tracker.trackExposure("sos_button_layout", "large_button", "user-1");
    tracker.trackExposure("sos_button_layout", "large_button", "user-1");

    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("registra exposições de experimentos diferentes separadamente", () => {
    const tracker = createExperimentTracker(sink);

    tracker.trackExposure("sos_button_layout", "control", "user-1");
    tracker.trackExposure("onboarding_flow", "control", "user-1");

    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("registra novamente quando o usuário muda", () => {
    const tracker = createExperimentTracker(sink);

    tracker.trackExposure("sos_button_layout", "control", "user-1");
    tracker.trackExposure("sos_button_layout", "control", "user-2");

    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("registra a conversão junto da variante atribuída", () => {
    const tracker = createExperimentTracker(sink);

    tracker.trackExposure("sos_button_layout", "large_button", "user-1");
    sink.mockClear();

    tracker.trackConversion("sos_button_layout", "alert_triggered", 1200);

    expect(sink).toHaveBeenCalledWith("experiment_converted", {
      experiment: "sos_button_layout",
      variant: "large_button",
      metric: "alert_triggered",
      valueMs: 1200,
    });
  });

  it("ignora conversão de experimento em que o usuário nunca foi exposto", () => {
    const tracker = createExperimentTracker(sink);

    tracker.trackConversion("sos_button_layout", "alert_triggered", 900);

    expect(sink).not.toHaveBeenCalled();
  });
});
