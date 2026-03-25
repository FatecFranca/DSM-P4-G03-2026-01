import type { FastifyBaseLogger } from "fastify";
import type {
  AlertEscalationNotifier,
  AlertEscalationNotifyPayload,
} from "./types.js";

export function createDevAlertEscalationNotifier(
  log: FastifyBaseLogger,
): AlertEscalationNotifier {
  return {
    async notifyEscalation(
      payload: AlertEscalationNotifyPayload,
    ): Promise<void> {
      log.info(
        {
          channel: "alert_escalation",
          mode: "dev",
          alertId: payload.alertId,
          escalationCount: payload.escalationCount,
          activeContactCount: payload.activeContactCount,
        },
        "alert_escalation (dev — no outbound provider)",
      );
    },
  };
}
