import type { FastifyBaseLogger } from "fastify";
import type {
  AlertEscalationNotifier,
  AlertEscalationNotifyPayload,
} from "./types.js";

export function createProductionStubAlertEscalationNotifier(
  log: FastifyBaseLogger,
): AlertEscalationNotifier {
  return {
    async notifyEscalation(
      payload: AlertEscalationNotifyPayload,
    ): Promise<void> {
      log.info(
        {
          channel: "alert_escalation",
          mode: "stub",
          alertId: payload.alertId,
          escalationCount: payload.escalationCount,
          activeContactCount: payload.activeContactCount,
        },
        "alert_escalation_stub",
      );
    },
  };
}
