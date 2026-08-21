import { logMobileTelemetry } from "../lib/telemetry";
import { createExperimentTracker } from "./tracking";

export { assignVariant } from "./assignment";
export { EXPERIMENTS, SOS_BUTTON_EXPERIMENT } from "./experiments";
export type { Experiment, ExperimentVariant } from "./types";

/** Tracker do processo: a deduplicação de exposição vale enquanto o app estiver vivo. */
export const experimentTracker = createExperimentTracker(logMobileTelemetry);
