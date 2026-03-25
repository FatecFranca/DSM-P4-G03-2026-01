import type { FastifyBaseLogger } from "fastify";

export type AlertTelemetryEvent =
  | "alert_started"
  | "alert_cancel_requested"
  | "alert_cancel_duress"
  | "alert_feed_viewed"
  | "location_point_sent"
  | "alert_acknowledged"
  | "alert_escalated";

/** Structured logs without PII (no email, name, or location). */
export function logAlertTelemetry(
  log: FastifyBaseLogger,
  event: AlertTelemetryEvent,
  fields: { alertId?: string } = {},
): void {
  log.info({ telemetry: event, alertId: fields.alertId }, "telemetry");
}
