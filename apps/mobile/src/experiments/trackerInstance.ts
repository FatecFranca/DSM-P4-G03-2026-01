import { logMobileTelemetry } from "../lib/telemetry";
import { recordExperimentEvent } from "./eventStore";
import {
  type ExperimentTelemetrySink,
  createExperimentTracker,
} from "./tracking";

const persistingSink: ExperimentTelemetrySink = (event, fields) => {
  logMobileTelemetry(event, fields);
  void recordExperimentEvent({
    type: event,
    experiment: String(fields.experiment),
    variant: String(fields.variant),
    metric: typeof fields.metric === "string" ? fields.metric : undefined,
    valueMs: typeof fields.valueMs === "number" ? fields.valueMs : undefined,
  });
};

/** Tracker do processo: a deduplicação de exposição vale enquanto o app estiver vivo. */
export const experimentTracker = createExperimentTracker(persistingSink);
