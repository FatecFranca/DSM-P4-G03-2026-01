import type { FastifyBaseLogger } from "fastify";

export type AlertTelemetryEvent =
  | "alert_started"
  | "alert_cancel_requested"
  | "alert_feed_viewed"
  | "location_point_sent"
  | "location_ingest_rejected"
  | "location_post_failed"
  | "first_location_ingest_ms"
  | "alert_acknowledged"
  | "alert_escalated"
  | "push_sent"
  | "push_failed"
  | "push_skipped_no_tokens"
  | "escalation_triggered";

export type AlertTelemetryFields = {
  alertId?: string;
  /** Server-side latency from alert start to first stored point (ms). */
  ms?: number;
  reason?: string;
};

/** Structured logs without PII (no email, name, or location). */
export function logAlertTelemetry(
  log: FastifyBaseLogger,
  event: AlertTelemetryEvent,
  fields: AlertTelemetryFields = {},
): void {
  log.info({ telemetry: event, ...fields }, "telemetry");
}
