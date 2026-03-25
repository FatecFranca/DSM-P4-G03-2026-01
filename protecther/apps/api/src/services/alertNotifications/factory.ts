import type { FastifyBaseLogger } from "fastify";
import { isNonProductionNodeEnv } from "../../config/env.js";
import { createDevAlertEscalationNotifier } from "./devLogger.js";
import { createProductionStubAlertEscalationNotifier } from "./productionStub.js";
import type { AlertEscalationNotifier } from "./types.js";

export function createAlertEscalationNotifier(
  log: FastifyBaseLogger,
): AlertEscalationNotifier {
  if (isNonProductionNodeEnv()) {
    return createDevAlertEscalationNotifier(log);
  }
  return createProductionStubAlertEscalationNotifier(log);
}
