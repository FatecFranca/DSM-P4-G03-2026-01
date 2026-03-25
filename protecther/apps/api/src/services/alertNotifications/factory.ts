import type { FastifyBaseLogger } from "fastify";
import { createPushProvider } from "../push/factory.js";
import { createAlertContactsPushOrchestrator } from "./contactsPushOrchestrator.js";
import type { AlertContactsPushNotifier } from "./types.js";

export function createAlertContactsPushNotifier(
  log: FastifyBaseLogger,
): AlertContactsPushNotifier {
  const push = createPushProvider(log);
  return createAlertContactsPushOrchestrator(log, push);
}
